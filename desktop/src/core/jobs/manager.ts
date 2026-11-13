import { randomUUID } from "node:crypto";
import type { Album } from "@tagtape/shared";
import { UserFacingError } from "../lib/errors.ts";
import type { Logger } from "../options.ts";
import type { Pipeline, ResolvedLink } from "../pipeline/types.ts";
import { Semaphore } from "./queue.ts";
import { probeJob, saveJob } from "./runner.ts";
import type { Job } from "./store.ts";

export interface JobManagerOptions {
	pipeline: Pipeline;
	/** How long a finished job is remembered. */
	ttlMs: number;
	/** Jobs checked at the same time, and how many may wait for that. */
	maxActiveProbes: number;
	maxQueuedJobs: number;
	/** Albums converting at the same time; the rest wait their turn. */
	maxActiveStreams: number;
	/** Jobs kept in memory (any status) before new ones are refused. */
	maxStoredJobs: number;
	/** A job's whole check (every track + the cover) must finish within this. */
	checkTimeoutMs: number;
	trackConcurrency: number;
	log: Logger;
	now?: () => Date;
}

export type CreateJobResult =
	| { kind: "ok"; job: Job }
	/** The check queue, or the job store, is full. */
	| { kind: "busy" };

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const CANCELLED = "Cancelled";

/**
 * Owns every job: creation, concurrency limits, the two phases (check every
 * track, then save the album), cancelling, forgetting and shutdown. Holds
 * metadata and the cover only, never audio.
 */
export class JobManager {
	readonly #options: JobManagerOptions;
	readonly #now: () => Date;
	readonly #jobs = new Map<string, Job>();
	readonly #probeSlots: Semaphore;
	readonly #streamSlots: Semaphore;
	readonly #running = new Set<Promise<void>>();
	#sweeper: NodeJS.Timeout | undefined;

	constructor(options: JobManagerOptions) {
		this.#options = options;
		this.#now = options.now ?? (() => new Date());
		this.#probeSlots = new Semaphore(options.maxActiveProbes);
		this.#streamSlots = new Semaphore(options.maxActiveStreams);
	}

	start(): void {
		this.#sweeper = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
		this.#sweeper.unref();
	}

	/**
	 * Queues a new job. `links` holds each track's source and canonical URL, in
	 * order; the album is saved in its own folder inside `destination`.
	 */
	create(
		album: Album,
		links: ResolvedLink[],
		destination: string,
	): CreateJobResult {
		const { maxActiveProbes, maxQueuedJobs, maxStoredJobs } = this.#options;
		if (
			this.#probeSlots.active + this.#probeSlots.waiting >=
			maxActiveProbes + maxQueuedJobs
		) {
			return { kind: "busy" };
		}
		// Every job (even a finished one) holds metadata and a cover in memory
		// until it's forgotten: cap how many exist at once.
		if (this.#jobs.size >= maxStoredJobs && this.sweep() === 0) {
			return { kind: "busy" };
		}
		const job: Job = {
			id: randomUUID(),
			album,
			destination,
			status: "queued",
			tracks: album.tracks.map((track, index) => {
				const link = links[index];
				if (!link) throw new Error(`Track ${index + 1} has no resolved link`);
				return {
					number: index + 1,
					title: track.title,
					url: link.url,
					source: link.source,
					status: "queued",
				};
			}),
			createdAt: this.#now(),
			controller: new AbortController(),
		};
		this.#jobs.set(job.id, job);
		this.#track(this.#run(job));
		return { kind: "ok", job };
	}

	get(id: string): Job | undefined {
		return this.#jobs.get(id);
	}

	/** Stops a job that is waiting or working. False when there's nothing to stop. */
	cancel(id: string): boolean {
		const job = this.#jobs.get(id);
		if (!job || job.finishedAt) return false;
		job.controller.abort(new UserFacingError(CANCELLED));
		return true;
	}

	/** True while any job is waiting or working. */
	get busy(): boolean {
		return this.#running.size > 0;
	}

	/** Promise that settles when every running job has finished (handy in tests). */
	async settled(): Promise<void> {
		while (this.#running.size > 0) {
			await Promise.allSettled([...this.#running]);
		}
	}

	/** Forgets jobs that finished more than `ttlMs` ago. */
	sweep(now: Date = this.#now()): number {
		let removed = 0;
		for (const job of this.#jobs.values()) {
			if (
				job.finishedAt &&
				now.getTime() - job.finishedAt.getTime() >= this.#options.ttlMs
			) {
				this.#jobs.delete(job.id);
				removed++;
			}
		}
		return removed;
	}

	/** Stops the sweeper and cancels every job; nothing half-written stays behind. */
	async close(): Promise<void> {
		clearInterval(this.#sweeper);
		for (const job of this.#jobs.values()) {
			job.controller.abort(new UserFacingError("TagTape was closed"));
		}
		await this.settled();
		this.#jobs.clear();
	}

	async #run(job: Job): Promise<void> {
		const { signal } = job.controller;
		const context = {
			pipeline: this.#options.pipeline,
			trackConcurrency: this.#options.trackConcurrency,
			log: this.#options.log,
		};
		try {
			if (!(await this.#check(job, context))) return;
			// Checked; now wait for a turn to convert.
			job.status = "queued";
			const release = await this.#streamSlots.acquire(signal);
			try {
				this.#options.log.info({ jobId: job.id }, "Saving started");
				if (await saveJob(job, context, signal)) {
					job.status = "done";
					return;
				}
			} finally {
				release();
			}
			const failed = job.tracks.find((track) => track.status === "error");
			if (failed) {
				this.#fail(job, `Track ${failed.number} failed: ${failed.error}`);
			}
		} catch (error) {
			if (!signal.aborted) {
				this.#options.log.error({ err: error, jobId: job.id }, "Job crashed");
				this.#fail(job, "Something went wrong. Please try again.");
			}
		} finally {
			// Cancelled, timed out or closed: the reason is the message.
			if (job.status !== "done" && job.status !== "failed") {
				const reason = signal.reason;
				this.#fail(
					job,
					reason instanceof UserFacingError ? reason.message : CANCELLED,
				);
			}
			job.finishedAt = this.#now();
			// The cover isn't needed any more.
			delete job.cover;
			this.#options.log.info(
				{ jobId: job.id, status: job.status },
				"Job finished",
			);
		}
	}

	/** Phase 1 under a check slot and a time budget. */
	async #check(
		job: Job,
		context: Parameters<typeof probeJob>[1],
	): Promise<boolean> {
		const release = await this.#probeSlots.acquire(job.controller.signal);
		// A slow source must not hold a check slot for long.
		const budget = setTimeout(
			() =>
				job.controller.abort(
					new UserFacingError(
						"Checking the tracks took too long. Try again, or remove slow links.",
					),
				),
			this.#options.checkTimeoutMs,
		);
		try {
			return await probeJob(job, context);
		} finally {
			clearTimeout(budget);
			release();
		}
	}

	#fail(job: Job, message: string): void {
		job.status = "failed";
		job.error = message;
		for (const track of job.tracks) {
			if (track.status === "converting") track.status = "queued";
		}
	}

	#track(promise: Promise<void>): void {
		const tracked = promise.finally(() => this.#running.delete(tracked));
		this.#running.add(tracked);
	}
}
