import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import type { Album } from "@tagtape/shared";
import { archiveFileName } from "../lib/filenames.ts";
import type { Pipeline } from "../pipeline/types.ts";
import { Semaphore } from "./queue.ts";
import { probeJob, streamJob } from "./runner.ts";
import { canStream, isProbed, type Job } from "./store.ts";

export interface JobManagerOptions {
	pipeline: Pipeline;
	ttlMs: number;
	/** Jobs checked at the same time, and how many may wait for that. */
	maxActiveProbes: number;
	maxQueuedJobs: number;
	/** Downloads converting at the same time, and how many may wait for that. */
	maxActiveStreams: number;
	maxQueuedStreams: number;
	trackConcurrency: number;
	log: {
		info: (obj: object, msg: string) => void;
		warn: (obj: object, msg: string) => void;
		error: (obj: object, msg: string) => void;
	};
	now?: () => Date;
}

export type OpenStreamResult =
	| { kind: "ok"; stream: Readable; fileName: string }
	| { kind: "not-found" }
	/** Not checked yet, or a track failed its check. */
	| { kind: "not-ready" }
	/** A download of this album is already queued or running. */
	| { kind: "busy" }
	/** Too many downloads waiting. */
	| { kind: "full" }
	/** The client left while waiting for a slot. */
	| { kind: "aborted" };

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Owns every job: creation, concurrency limits, the two phases (check, then
 * stream on download), expiry and shutdown. Holds metadata only, never audio.
 */
export class JobManager {
	readonly #options: JobManagerOptions;
	readonly #now: () => Date;
	readonly #jobs = new Map<string, Job>();
	readonly #probeSlots: Semaphore;
	readonly #streamSlots: Semaphore;
	readonly #running = new Set<Promise<void>>();
	readonly #shutdown = new AbortController();
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

	/** Queues a new job for checking, or returns `undefined` when the queue is full. */
	create(album: Album): Job | undefined {
		const { maxActiveProbes, maxQueuedJobs, ttlMs } = this.#options;
		if (
			this.#probeSlots.active + this.#probeSlots.waiting >=
			maxActiveProbes + maxQueuedJobs
		) {
			return undefined;
		}
		const createdAt = this.#now();
		const job: Job = {
			id: randomUUID(),
			album,
			status: "queued",
			tracks: album.tracks.map((track, index) => ({
				number: index + 1,
				title: track.title,
				url: track.url,
				status: "queued",
			})),
			createdAt,
			expiresAt: new Date(createdAt.getTime() + ttlMs),
			controller: new AbortController(),
		};
		this.#jobs.set(job.id, job);
		this.#track(this.#probe(job));
		return job;
	}

	get(id: string): Job | undefined {
		return this.#jobs.get(id);
	}

	/**
	 * Starts a download: waits for a stream slot (before any response is sent),
	 * then returns the album's ZIP stream. `signal` is the client's connection;
	 * aborting it kills the running conversion.
	 */
	async openStream(id: string, signal: AbortSignal): Promise<OpenStreamResult> {
		const job = this.#jobs.get(id);
		if (!job) return { kind: "not-found" };
		if (!isProbed(job)) return { kind: "not-ready" };
		if (!canStream(job)) return { kind: "busy" };
		const { maxActiveStreams, maxQueuedStreams } = this.#options;
		if (
			this.#streamSlots.active + this.#streamSlots.waiting >=
			maxActiveStreams + maxQueuedStreams
		) {
			return { kind: "full" };
		}

		const previous = job.status;
		job.status = "queued";
		const release = await this.#streamSlots.acquire();
		const streamSignal = AbortSignal.any([signal, this.#shutdown.signal]);
		if (streamSignal.aborted) {
			release();
			job.status = previous;
			return { kind: "aborted" };
		}

		const stream = streamJob(job, this.#runnerContext(), streamSignal);
		this.#track(
			new Promise<void>((resolve) => {
				let ended = false;
				stream.once("end", () => {
					ended = true;
				});
				stream.once("close", () => {
					this.#settleStream(job, ended, streamSignal.aborted);
					release();
					resolve();
				});
			}),
		);
		this.#options.log.info({ jobId: job.id }, "Download started");
		return {
			kind: "ok",
			stream,
			fileName: archiveFileName(job.album.artist, job.album.title),
		};
	}

	/** Promise that settles when every running phase has finished (handy in tests). */
	async settled(): Promise<void> {
		while (this.#running.size > 0) {
			await Promise.allSettled([...this.#running]);
		}
	}

	/** Forgets jobs whose TTL has passed, unless they're working right now. */
	sweep(now: Date = this.#now()): number {
		let removed = 0;
		for (const job of this.#jobs.values()) {
			const busy =
				job.status === "probing" ||
				job.status === "streaming" ||
				job.status === "queued";
			if (!busy && job.expiresAt <= now) {
				this.#jobs.delete(job.id);
				removed++;
			}
		}
		return removed;
	}

	/** Stops the sweeper and cancels every check and download. */
	async close(): Promise<void> {
		clearInterval(this.#sweeper);
		this.#shutdown.abort(new Error("Server is shutting down"));
		for (const job of this.#jobs.values()) {
			job.controller.abort(new Error("Server is shutting down"));
		}
		await this.settled();
		this.#jobs.clear();
	}

	async #probe(job: Job): Promise<void> {
		const release = await this.#probeSlots.acquire();
		try {
			if (job.controller.signal.aborted) return;
			await probeJob(job, this.#runnerContext());
		} catch (error) {
			this.#options.log.error({ err: error, jobId: job.id }, "Job crashed");
			job.status = "failed";
			job.error = "Something went wrong on our side. Please try again.";
			job.expiresAt = this.#expiry();
		} finally {
			release();
			this.#options.log.info(
				{ jobId: job.id, status: job.status },
				"Job checked",
			);
		}
	}

	#settleStream(job: Job, ended: boolean, aborted: boolean): void {
		job.expiresAt = this.#expiry();
		if (ended) {
			job.status = "done";
		} else if (
			aborted &&
			!job.tracks.some((track) => track.status === "error")
		) {
			// The browser left (or the server is stopping): ready to try again.
			job.status = "ready";
			for (const track of job.tracks) track.status = "queued";
		} else {
			const failed = job.tracks.find((track) => track.status === "error");
			job.status = "failed";
			job.error = failed
				? `Track ${failed.number} failed: ${failed.error}`
				: "The download stopped unexpectedly. Please try again.";
		}
		this.#options.log.info(
			{ jobId: job.id, status: job.status },
			"Download finished",
		);
	}

	#runnerContext() {
		return {
			pipeline: this.#options.pipeline,
			trackConcurrency: this.#options.trackConcurrency,
			ttlMs: this.#options.ttlMs,
			now: this.#now,
			log: this.#options.log,
		};
	}

	#expiry(): Date {
		return new Date(this.#now().getTime() + this.#options.ttlMs);
	}

	#track(promise: Promise<void>): void {
		const tracked = promise.finally(() => this.#running.delete(tracked));
		this.#running.add(tracked);
	}
}
