import { PassThrough, type Readable } from "node:stream";
import { MAX_TRACK_SECONDS } from "@tagtape/shared";
import { UserFacingError, userMessage } from "../lib/errors.ts";
import { trackFileName } from "../lib/filenames.ts";
import { streamZip } from "../pipeline/archive.ts";
import { createTag } from "../pipeline/tags.ts";
import type { Pipeline } from "../pipeline/types.ts";
import type { TrackProbe } from "../plugins/api.ts";
import { mapLimit } from "./queue.ts";
import type { Job, TrackState } from "./store.ts";

export interface RunnerContext {
	pipeline: Pipeline;
	trackConcurrency: number;
	ttlMs: number;
	now: () => Date;
	log: {
		warn: (obj: object, msg: string) => void;
		error: (obj: object, msg: string) => void;
	};
}

/**
 * Phase 1: check every track (one metadata fetch each, kept in memory) and
 * square the cover. Ends `ready`, or `failed` with a reason per track, before
 * anything is downloaded.
 */
export async function probeJob(job: Job, ctx: RunnerContext): Promise<void> {
	const { signal } = job.controller;
	job.status = "probing";

	const probes = await mapLimit(
		job.tracks,
		ctx.trackConcurrency,
		(track) =>
			ctx.pipeline.probe({ source: track.source, url: track.url, signal }),
		signal,
	);
	if (signal.aborted) return;

	probes.forEach((result, index) => {
		const track = job.tracks[index] as TrackState;
		const problem =
			result.status === "rejected"
				? reportError(
						ctx,
						job,
						track,
						result.reason,
						"Couldn't read this track",
					)
				: probeProblem(result.value);
		if (problem) {
			track.status = "error";
			track.error = problem;
		} else if (result.status === "fulfilled") {
			track.probed = true;
			track.state = result.value.state;
		}
	});
	if (job.tracks.some((track) => track.status === "error")) {
		fail(
			job,
			ctx,
			"Some tracks can't be used. Fix or remove them and try again.",
		);
		return;
	}

	if (job.album.coverUrl) {
		try {
			job.cover = await ctx.pipeline.fetchCover({
				url: job.album.coverUrl,
				signal,
			});
		} catch (error) {
			if (signal.aborted) return;
			fail(
				job,
				ctx,
				reportError(ctx, job, undefined, error, "Couldn't use the cover image"),
			);
			return;
		}
	}

	job.status = "ready";
	job.expiresAt = new Date(ctx.now().getTime() + ctx.ttlMs);
}

/**
 * Phase 2, run for each download: the album as a ZIP stream. Tracks convert
 * one after another *while* the ZIP is read: each entry is our ID3 tag followed
 * by the source's MP3 stream. Nothing is written to disk.
 *
 * Track statuses update as it goes. The caller decides the job's final status
 * from how the stream ends.
 */
export function streamJob(
	job: Job,
	ctx: RunnerContext,
	signal: AbortSignal,
): Readable {
	job.status = "streaming";
	delete job.error;
	const total = job.tracks.length;
	for (const track of job.tracks) {
		track.status = "queued";
		delete track.error;
	}

	return streamZip(
		job.tracks.map((track) => ({
			name: trackFileName(track.number, total, track.title),
			open: () => {
				track.status = "converting";
				const entry = new PassThrough();
				entry.write(
					createTag({
						title: track.title,
						artist: job.album.artist,
						album: job.album.title,
						trackNumber: track.number,
						trackTotal: total,
						...(job.album.year ? { year: job.album.year } : {}),
						...(job.album.genre ? { genre: job.album.genre } : {}),
						...(job.cover ? { cover: job.cover } : {}),
					}),
				);
				const mp3 = ctx.pipeline.stream({
					source: track.source,
					state: track.state,
					signal,
				});
				mp3.once("end", () => {
					track.status = "done";
				});
				mp3.once("error", (error) => {
					if (!signal.aborted) {
						track.status = "error";
						track.error = reportError(
							ctx,
							job,
							track,
							error,
							"Couldn't convert this track",
						);
					}
					entry.destroy(error);
				});
				mp3.pipe(entry);
				return entry;
			},
		})),
	);
}

function probeProblem(probe: TrackProbe): string | undefined {
	if (probe.isLive) return "Live streams and premieres can't be converted";
	if (probe.durationSeconds === null)
		return "Couldn't determine the track's length";
	if (probe.durationSeconds > MAX_TRACK_SECONDS) {
		return `Longer than ${describeLimit(MAX_TRACK_SECONDS)} (${formatDuration(probe.durationSeconds)})`;
	}
	return undefined;
}

/** 7200 → "2 hours", 600 → "10 minutes". */
export function describeLimit(seconds: number): string {
	if (seconds % 3600 === 0) {
		const hours = seconds / 3600;
		return `${hours} hour${hours === 1 ? "" : "s"}`;
	}
	const minutes = Math.round(seconds / 60);
	return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export function formatDuration(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = String(seconds % 60).padStart(2, "0");
	return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Logs unexpected errors; returns the message the user should see. */
function reportError(
	ctx: RunnerContext,
	job: Job,
	track: TrackState | undefined,
	error: unknown,
	fallback: string,
): string {
	if (!(error instanceof UserFacingError)) {
		ctx.log.error(
			{ err: error, jobId: job.id, track: track?.number },
			fallback,
		);
	} else if (error.cause) {
		// Users see the friendly message; operators get the original (e.g. a tool's stderr).
		ctx.log.warn(
			{ err: error.cause, jobId: job.id, track: track?.number },
			error.message,
		);
	}
	return userMessage(error, fallback);
}

function fail(job: Job, ctx: RunnerContext, message: string): void {
	job.status = "failed";
	job.error = message;
	job.expiresAt = new Date(ctx.now().getTime() + ctx.ttlMs);
	job.controller.abort(new UserFacingError(message));
}
