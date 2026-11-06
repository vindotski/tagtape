import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { type Album, isJobFinished } from "@tagtape/shared";
import type { Pipeline } from "../pipeline/types.ts";
import { Semaphore } from "./queue.ts";
import { runJob } from "./runner.ts";
import type { Job } from "./store.ts";

export interface JobManagerOptions {
	pipeline: Pipeline;
	tmpDir: string;
	ttlMs: number;
	maxActiveJobs: number;
	maxQueuedJobs: number;
	trackConcurrency: number;
	log: {
		info: (obj: object, msg: string) => void;
		error: (obj: object, msg: string) => void;
	};
	now?: () => Date;
}

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/** Owns every job: creation, the concurrency limit, running, expiry and shutdown. */
export class JobManager {
	readonly #options: JobManagerOptions;
	readonly #now: () => Date;
	readonly #jobs = new Map<string, Job>();
	readonly #slots: Semaphore;
	readonly #running = new Set<Promise<void>>();
	#sweeper: NodeJS.Timeout | undefined;

	constructor(options: JobManagerOptions) {
		this.#options = options;
		this.#now = options.now ?? (() => new Date());
		this.#slots = new Semaphore(options.maxActiveJobs);
	}

	/** Wipes leftovers from a previous run and starts the TTL sweeper. */
	async start(): Promise<void> {
		await rm(this.#options.tmpDir, { recursive: true, force: true });
		await mkdir(this.#options.tmpDir, { recursive: true });
		this.#sweeper = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
		this.#sweeper.unref();
	}

	/** Queues a new job, or returns `undefined` when the queue is full. */
	create(album: Album): Job | undefined {
		const { maxActiveJobs, maxQueuedJobs, ttlMs, tmpDir } = this.#options;
		if (
			this.#slots.active + this.#slots.waiting >=
			maxActiveJobs + maxQueuedJobs
		) {
			return undefined;
		}
		const id = randomUUID();
		const createdAt = this.#now();
		const job: Job = {
			id,
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
			dir: join(tmpDir, id),
			controller: new AbortController(),
		};
		this.#jobs.set(id, job);

		const running = this.#run(job).finally(() => this.#running.delete(running));
		this.#running.add(running);
		return job;
	}

	get(id: string): Job | undefined {
		return this.#jobs.get(id);
	}

	/** Promise that settles when `job` has finished (handy in tests). */
	async settled(): Promise<void> {
		await Promise.allSettled([...this.#running]);
	}

	async #run(job: Job): Promise<void> {
		const release = await this.#slots.acquire();
		try {
			if (job.controller.signal.aborted) return;
			await mkdir(job.dir, { recursive: true });
			await runJob(job, {
				pipeline: this.#options.pipeline,
				trackConcurrency: this.#options.trackConcurrency,
				ttlMs: this.#options.ttlMs,
				now: this.#now,
				log: this.#options.log,
			});
		} catch (error) {
			this.#options.log.error({ err: error, jobId: job.id }, "Job crashed");
			job.status = "failed";
			job.error = "Something went wrong on our side. Please try again.";
			job.expiresAt = new Date(this.#now().getTime() + this.#options.ttlMs);
			await rm(job.dir, { recursive: true, force: true });
		} finally {
			release();
			this.#options.log.info(
				{ jobId: job.id, status: job.status },
				"Job finished",
			);
		}
	}

	/** Deletes finished jobs (and their ZIPs) whose TTL has passed. */
	async sweep(now: Date = this.#now()): Promise<number> {
		const expired = [...this.#jobs.values()].filter(
			(job) => isJobFinished(job.status) && job.expiresAt <= now,
		);
		for (const job of expired) this.#jobs.delete(job.id);
		await Promise.all(
			expired.map((job) => rm(job.dir, { recursive: true, force: true })),
		);
		return expired.length;
	}

	/** Stops the sweeper, cancels every job, and removes all temp files. */
	async close(): Promise<void> {
		clearInterval(this.#sweeper);
		for (const job of this.#jobs.values()) {
			job.controller.abort(new Error("Server is shutting down"));
		}
		await this.settled();
		this.#jobs.clear();
		await rm(this.#options.tmpDir, { recursive: true, force: true });
	}
}
