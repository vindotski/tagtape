import {
	albumInputSchema,
	type JobSnapshot,
	UNSUPPORTED_LINK,
} from "@tagtape/shared";
import { JobManager } from "./jobs/manager.ts";
import { toSnapshot } from "./jobs/store.ts";
import { type EgressProxy, startEgressProxy } from "./lib/egress-proxy.ts";
import { UserFacingError } from "./lib/errors.ts";
import { ExecError, run, spawnStream } from "./lib/exec.ts";
import { LIMITS, type TagTapeOptions } from "./options.ts";
import { createPipeline } from "./pipeline/index.ts";
import type { Pipeline, ResolvedLink, SourceInfo } from "./pipeline/types.ts";
import { loadPlugins } from "./plugins/loader.ts";
import { createDirectSource } from "./sources/direct.ts";
import { createYtDlpSource } from "./sources/ytdlp.ts";

export type { Logger, TagTapeOptions } from "./options.ts";
export type { SourceInfo } from "./pipeline/types.ts";

/** A problem with one field of the album, keyed like the form's errors (`tracks.0.url`). */
export interface FieldIssue {
	path: string;
	message: string;
}

export type CreateJobOutcome =
	| { kind: "ok"; jobId: string }
	| { kind: "invalid"; issues: FieldIssue[] }
	| { kind: "busy"; message: string };

/** The whole pipeline behind one object: what the app's main process talks to. */
export interface TagTape {
	/** The sources links can come from, in matching order. */
	sources(): SourceInfo[];
	/**
	 * Validates the album, matches each link to a source and queues the job:
	 * every track is checked, then the album is saved in its own folder inside
	 * `destination`.
	 */
	createJob(input: unknown, destination: string): CreateJobOutcome;
	getJob(id: string): JobSnapshot | undefined;
	/** Stops a job; whatever it wrote is removed. False if it already ended. */
	cancelJob(id: string): boolean;
	/** True while any album is being checked or saved. */
	busy(): boolean;
	/** Versions of ffmpeg and of each source; rejects when a binary doesn't run. */
	versions(): Promise<Record<string, string>>;
	/** Cancels every job (nothing half-written stays) and frees the egress proxy. */
	close(): Promise<void>;
}

/**
 * Builds the real pipeline: plugins first, then direct MP3 links (strict and
 * cheap), then yt-dlp, which takes any other public link.
 */
export async function createTagTape(options: TagTapeOptions): Promise<TagTape> {
	const { log } = options;
	const plugins = await loadPlugins(options.plugins ?? [], {
		env: options.pluginEnv ?? {},
		ffmpegBin: options.ffmpegBin,
		run,
		spawnStream,
		ExecError,
		UserFacingError,
		log,
	});
	const sources = [
		...plugins,
		createDirectSource({
			ffmpegBin: options.ffmpegBin,
			maxBytes: LIMITS.maxDirectBytes,
			timeoutMs: LIMITS.sourceTimeoutMs,
		}),
	];
	let egressProxy: EgressProxy | undefined;
	if (options.ytdlpBin) {
		// yt-dlp fetches links itself: everything it (and its ffmpeg) opens
		// goes through this proxy, which refuses private addresses.
		egressProxy = await startEgressProxy({ log });
		sources.push(
			createYtDlpSource({
				bin: options.ytdlpBin,
				ffmpegBin: options.ffmpegBin,
				jsRuntime: options.jsRuntime ?? "",
				proxy: egressProxy.url,
				timeoutMs: LIMITS.sourceTimeoutMs,
				maxChecks: LIMITS.ytdlpMaxChecks,
				cooldownMs: LIMITS.ytdlpCooldownMs,
				log,
			}),
		);
	}
	const tagtape = fromPipeline(
		createPipeline(options.ffmpegBin, sources),
		options,
	);
	return {
		...tagtape,
		async close() {
			await tagtape.close();
			await egressProxy?.close();
		},
	};
}

/** The same object over any pipeline (tests pass a fake one). */
export function fromPipeline(
	pipeline: Pipeline,
	options: Pick<TagTapeOptions, "log"> & { now?: () => Date },
): TagTape & { jobs: JobManager } {
	const jobs = new JobManager({
		pipeline,
		ttlMs: LIMITS.jobTtlMs,
		maxActiveProbes: LIMITS.maxActiveProbes,
		maxQueuedJobs: LIMITS.maxQueuedJobs,
		maxActiveStreams: LIMITS.maxActiveStreams,
		maxStoredJobs: LIMITS.maxStoredJobs,
		checkTimeoutMs: LIMITS.checkTimeoutMs,
		trackConcurrency: LIMITS.trackConcurrency,
		log: options.log,
		...(options.now ? { now: options.now } : {}),
	});
	jobs.start();

	return {
		jobs,
		sources: () => pipeline.sources,
		createJob(input, destination) {
			const parsed = albumInputSchema.safeParse(input);
			if (!parsed.success) {
				return {
					kind: "invalid",
					issues: parsed.error.issues.map((issue) => ({
						path: issue.path.join("."),
						message: issue.message,
					})),
				};
			}
			// The schema checked that each link is a URL; a source must claim it.
			const links: ResolvedLink[] = [];
			const issues: FieldIssue[] = [];
			parsed.data.tracks.forEach((track, index) => {
				const link = pipeline.resolve(track.url);
				if (link) links.push(link);
				else
					issues.push({
						path: `tracks.${index}.url`,
						message: UNSUPPORTED_LINK,
					});
			});
			if (issues.length > 0) return { kind: "invalid", issues };

			const created = jobs.create(parsed.data, links, destination);
			if (created.kind === "busy") {
				return {
					kind: "busy",
					message:
						"TagTape is busy with other albums. Try again when they're done.",
				};
			}
			options.log.info(
				{ jobId: created.job.id, tracks: created.job.tracks.length },
				"Job created",
			);
			return { kind: "ok", jobId: created.job.id };
		},
		getJob(id) {
			const job = jobs.get(id);
			return job ? toSnapshot(job) : undefined;
		},
		cancelJob: (id) => jobs.cancel(id),
		busy: () => jobs.busy,
		versions: () => pipeline.versions(),
		close: () => jobs.close(),
	};
}
