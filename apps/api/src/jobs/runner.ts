import { rm } from "node:fs/promises";
import { join } from "node:path";
import { MAX_TRACK_SECONDS } from "@tagtape/shared";
import { UserFacingError, userMessage } from "../lib/errors.ts";
import { archiveFileName, trackFileName } from "../lib/filenames.ts";
import type { Pipeline } from "../pipeline/types.ts";
import { mapLimit } from "./queue.ts";
import type { Job, TrackState } from "./store.ts";

export interface RunnerContext {
	pipeline: Pipeline;
	trackConcurrency: number;
	ttlMs: number;
	now: () => Date;
	log: { error: (obj: object, msg: string) => void };
}

/**
 * Runs one job to completion, mutating `job` as it goes so `GET /jobs/:id`
 * always shows the current state:
 *
 * 1. probe every track (one metadata fetch each), and reject the whole job
 *    before downloading anything if a track is too long, live, or unavailable
 * 2. fetch and square the cover (optional)
 * 3. download, convert and tag every track
 * 4. zip the tagged MP3s
 */
export async function runJob(job: Job, ctx: RunnerContext): Promise<void> {
	const { signal } = job.controller;
	const infoPath = (track: TrackState) =>
		join(job.dir, `${track.number}.info.json`);

	// 1. Probe
	job.status = "probing";
	const probes = await mapLimit(
		job.tracks,
		ctx.trackConcurrency,
		(track) =>
			ctx.pipeline.probe({ url: track.url, infoPath: infoPath(track), signal }),
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
						"Couldn't read this video",
					)
				: probeProblem(result.value);
		if (problem) {
			track.status = "error";
			track.error = problem;
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

	// 2. Cover
	let cover: Buffer | undefined;
	if (job.album.coverUrl) {
		try {
			cover = await ctx.pipeline.fetchCover({
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

	// 3. Download, convert, tag. The first failure stops the remaining tracks.
	job.status = "processing";
	const total = job.tracks.length;
	const mp3Paths: string[] = [];
	const downloads = await mapLimit(
		job.tracks,
		ctx.trackConcurrency,
		async (track) => {
			try {
				track.status = "downloading";
				const mp3Path = await ctx.pipeline.downloadAudio({
					infoPath: infoPath(track),
					workDir: job.dir,
					baseName: String(track.number),
					signal,
					onConverting: () => {
						track.status = "converting";
					},
				});
				track.status = "tagging";
				await ctx.pipeline.writeTags(mp3Path, {
					title: track.title,
					artist: job.album.artist,
					album: job.album.title,
					trackNumber: track.number,
					trackTotal: total,
					...(job.album.year ? { year: job.album.year } : {}),
					...(job.album.genre ? { genre: job.album.genre } : {}),
					...(cover ? { cover } : {}),
				});
				mp3Paths[track.number - 1] = mp3Path;
				track.status = "done";
			} catch (error) {
				if (!signal.aborted) {
					track.status = "error";
					track.error = reportError(
						ctx,
						job,
						track,
						error,
						"Couldn't process this track",
					);
					job.controller.abort(new UserFacingError("Another track failed"));
				}
				throw error;
			}
		},
		signal,
	);
	if (downloads.some((result) => result.status === "rejected")) {
		const failed = job.tracks.find((track) => track.status === "error");
		fail(
			job,
			ctx,
			failed
				? `Track ${failed.number} failed: ${failed.error}`
				: "Processing was interrupted",
		);
		return;
	}

	// 4. Package
	job.status = "packaging";
	const archivePath = join(job.dir, "album.zip");
	try {
		await ctx.pipeline.writeArchive({
			entries: job.tracks.map((track) => ({
				path: mp3Paths[track.number - 1] as string,
				name: trackFileName(track.number, total, track.title),
			})),
			outPath: archivePath,
			signal,
		});
	} catch (error) {
		if (signal.aborted) return;
		fail(
			job,
			ctx,
			reportError(ctx, job, undefined, error, "Couldn't create the ZIP file"),
		);
		return;
	}

	// Keep only the ZIP on disk.
	await Promise.all(
		job.tracks.flatMap((track) => [
			rm(mp3Paths[track.number - 1] as string, { force: true }),
			rm(infoPath(track), { force: true }),
		]),
	);

	job.archivePath = archivePath;
	job.archiveName = archiveFileName(job.album.artist, job.album.title);
	job.status = "done";
	job.expiresAt = new Date(ctx.now().getTime() + ctx.ttlMs);
}

function probeProblem(probe: {
	durationSeconds: number | null;
	isLive: boolean;
}): string | undefined {
	if (probe.isLive) return "Live streams and premieres can't be converted";
	if (probe.durationSeconds === null)
		return "Couldn't determine the video's length";
	if (probe.durationSeconds > MAX_TRACK_SECONDS) {
		return `Longer than ${MAX_TRACK_SECONDS / 60} minutes (${formatDuration(probe.durationSeconds)})`;
	}
	return undefined;
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
	}
	return userMessage(error, fallback);
}

function fail(job: Job, ctx: RunnerContext, message: string): void {
	job.status = "failed";
	job.error = message;
	job.expiresAt = new Date(ctx.now().getTime() + ctx.ttlMs);
	job.controller.abort(new UserFacingError(message));
	void rm(job.dir, { recursive: true, force: true });
}
