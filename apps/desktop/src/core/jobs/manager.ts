import { randomUUID } from "node:crypto";
import type { Album } from "@tagtape/shared";
import { UserFacingError } from "../lib/errors.ts";
import type { Logger } from "../options.ts";
import type { Pipeline, ResolvedLink } from "../pipeline/types.ts";
import { probeJob, saveJob } from "./runner.ts";
import type { Job } from "./store.ts";

export interface JobManagerOptions {
	pipeline: Pipeline;
	/** Finished jobs kept in memory (their status and folder); older ones are forgotten. */
	finishedKept: number;
	/** A job's whole check (every track + the cover) must finish within this. */
	checkTimeoutMs: number;
	trackConcurrency: number;
	log: Logger;
	now?: () => Date;
}

export type CreateJobResult =
	| { kind: "ok"; job: Job }
	/** Another album is still being made: one at a time. */
	| { kind: "busy" };

const CANCELLED = "Cancelled";

/**
 * Owns every job: creation, the two phases (check every track, then save
 * the album), cancelling and shutdown. One album is made at a time: one
 * person uses the app, and a second album would only fight the first for the
 * connection. Holds metadata and the cover only, never audio.
 */
export class JobManager {
	readonly #options: JobManagerOptions;
	readonly #now: () => Date;
	readonly #jobs = new Map<string, Job>();
	readonly #running = new Set<Promise<void>>();
	readonly #listeners = new Set<(job: Job) => void>();

	constructor(options: JobManagerOptions) {
		this.#options = options;
		this.#now = options.now ?? (() => new Date());
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
		if (this.busy) return { kind: "busy" };
		this.#forgetOldest();
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
		this.#notify(job);
		this.#track(this.#run(job));
		return { kind: "ok", job };
	}

	/**
	 * Calls `listener` whenever a job's status, or one of its tracks', changes.
	 * The last call for a job is the one where it has ended; its cover is still
	 * in memory during that call and gone right after. Returns the unsubscribe.
	 */
	subscribe(listener: (job: Job) => void): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
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

	/** The job being made right now, if any. */
	get active(): Job | undefined {
		for (const job of this.#jobs.values()) {
			if (!job.finishedAt) return job;
		}
		return undefined;
	}

	/**
	 * Finished jobs hold only a status and a folder path, so they are kept
	 * for as long as the app runs, up to a number nobody reaches in a day.
	 */
	#forgetOldest(): void {
		// A Map keeps insertion order: the first finished ones are the oldest.
		for (const job of this.#jobs.values()) {
			if (this.#jobs.size < this.#options.finishedKept) return;
			if (job.finishedAt) this.#jobs.delete(job.id);
		}
	}

	/** Cancels every job; nothing half-written stays behind. */
	async close(): Promise<void> {
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
			changed: (changed: Job) => this.#notify(changed),
			log: this.#options.log,
		};
		try {
			if (!(await this.#check(job, context))) return;
			this.#options.log.info({ jobId: job.id }, "Saving started");
			if (await saveJob(job, context, signal)) {
				job.status = "done";
				return;
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
			this.#notify(job);
			// The cover isn't needed any more.
			delete job.cover;
			this.#options.log.info(
				{ jobId: job.id, status: job.status },
				"Job finished",
			);
		}
	}

	/** Phase 1 under a time budget. */
	async #check(
		job: Job,
		context: Parameters<typeof probeJob>[1],
	): Promise<boolean> {
		// A slow source must not keep the album waiting forever.
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
		}
	}

	#fail(job: Job, message: string): void {
		job.status = "failed";
		job.error = message;
		for (const track of job.tracks) {
			if (track.status === "converting") track.status = "queued";
		}
	}

	/** A listener that throws must never break a job. */
	#notify(job: Job): void {
		for (const listener of this.#listeners) {
			try {
				listener(job);
			} catch (error) {
				this.#options.log.error(
					{ err: error, jobId: job.id },
					"A job listener failed",
				);
			}
		}
	}

	#track(promise: Promise<void>): void {
		const tracked = promise.finally(() => this.#running.delete(tracked));
		this.#running.add(tracked);
	}
}
