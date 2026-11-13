import {
	albumFolderName,
	createTag,
	probeProblem,
	trackFileName,
} from "@tagtape/shared";
import { UserFacingError, userMessage } from "../lib/errors.ts";
import {
	createAlbumFolder,
	discardAlbum,
	writeTrack,
} from "../pipeline/album-folder.ts";
import type { Pipeline } from "../pipeline/types.ts";
import { mapLimit } from "./queue.ts";
import type { Job, TrackState } from "./store.ts";

export interface RunnerContext {
	pipeline: Pipeline;
	trackConcurrency: number;
	log: {
		warn: (obj: object, msg: string) => void;
		error: (obj: object, msg: string) => void;
	};
}

/**
 * Phase 1: check every track (one metadata fetch each, kept in memory) and
 * square the cover. Returns true when the album can be saved; otherwise the
 * job is `failed` with a reason per track, before anything is downloaded.
 */
export async function probeJob(job: Job, ctx: RunnerContext): Promise<boolean> {
	const { signal } = job.controller;
	job.status = "probing";

	const probes = await mapLimit(
		job.tracks,
		ctx.trackConcurrency,
		(track) =>
			ctx.pipeline.probe({ source: track.source, url: track.url, signal }),
		signal,
	);
	if (signal.aborted) return false;

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
			track.state = result.value.state;
		}
	});
	if (job.tracks.some((track) => track.status === "error")) {
		fail(job, "Some tracks can't be used. Fix or remove them and try again.");
		return false;
	}

	if (job.album.coverUrl) {
		try {
			job.cover = await ctx.pipeline.fetchCover({
				url: job.album.coverUrl,
				signal,
			});
		} catch (error) {
			if (signal.aborted) return false;
			fail(
				job,
				reportError(ctx, job, undefined, error, "Couldn't use the cover image"),
			);
			return false;
		}
	}
	return !signal.aborted;
}

/**
 * Phase 2: the album as a folder of MP3s inside the job's destination. Tracks
 * convert one after another, each written as our ID3 tag followed by the
 * source's MP3 stream. Nothing else touches the disk, and an album that fails
 * or is cancelled leaves nothing behind.
 *
 * Returns true when every track was saved. Track statuses update as it goes;
 * on failure the failing track carries the reason.
 */
export async function saveJob(
	job: Job,
	ctx: RunnerContext,
	signal: AbortSignal,
): Promise<boolean> {
	job.status = "streaming";
	const total = job.tracks.length;
	const folder = await createAlbumFolder(
		job.destination,
		albumFolderName(job.album.artist, job.album.title),
	);
	const written: string[] = [];
	for (const track of job.tracks) {
		track.status = "converting";
		const tag = createTag({
			title: track.title,
			artist: job.album.artist,
			album: job.album.title,
			trackNumber: track.number,
			trackTotal: total,
			...(job.album.year ? { year: job.album.year } : {}),
			...(job.album.genre ? { genre: job.album.genre } : {}),
			...(job.cover ? { cover: job.cover } : {}),
		});
		try {
			const mp3 = ctx.pipeline.stream({
				source: track.source,
				state: track.state,
				signal,
			});
			written.push(
				await writeTrack(
					folder,
					trackFileName(track.number, total, track.title),
					tag,
					mp3,
					signal,
				),
			);
			track.status = "done";
		} catch (error) {
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
			await discardAlbum(folder, written);
			return false;
		}
	}
	// Cancelled just as the last track landed: still a cancelled album.
	if (signal.aborted) {
		await discardAlbum(folder, written);
		return false;
	}
	job.folder = folder;
	return true;
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

function fail(job: Job, message: string): void {
	job.status = "failed";
	job.error = message;
}
