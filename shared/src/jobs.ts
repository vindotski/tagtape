import { z } from "zod";

/**
 * Job lifecycle: queued → probing → [queued →] streaming → done.
 * Any phase can end in `failed` (a cancelled job fails with "Cancelled").
 * A failed job leaves nothing on disk.
 */
export const jobStatusSchema = z.enum([
	/** Waiting for a free slot (to check the tracks, or to convert them). */
	"queued",
	/** Reading each track's details; nothing is downloaded yet. */
	"probing",
	/** Tracks are being converted and saved into the album's folder. */
	"streaming",
	"done",
	"failed",
]);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const trackStatusSchema = z.enum([
	"queued",
	"converting",
	"done",
	"error",
]);
export type TrackStatus = z.infer<typeof trackStatusSchema>;

export const trackSnapshotSchema = z.object({
	/** 1-based track number (position in the album). */
	number: z.int().positive(),
	title: z.string(),
	status: trackStatusSchema,
	/** Human-readable reason when `status` is `error`. */
	error: z.string().optional(),
});
export type TrackSnapshot = z.infer<typeof trackSnapshotSchema>;

export const jobSnapshotSchema = z.object({
	id: z.uuid(),
	status: jobStatusSchema,
	tracks: z.array(trackSnapshotSchema),
	/** Human-readable reason when `status` is `failed`. */
	error: z.string().optional(),
	/** The album's folder, once every track is saved (`status` is `done`). */
	folder: z.string().optional(),
	createdAt: z.iso.datetime(),
});
export type JobSnapshot = z.infer<typeof jobSnapshotSchema>;

/**
 * How far along a job is, 0 to 100, for a progress bar. Checking counts as 0;
 * saved tracks fill up to 95, and only a finished album is 100.
 */
export function jobProgress(
	job: Pick<JobSnapshot, "status" | "tracks">,
): number {
	if (job.status === "done") return 100;
	if (job.status !== "streaming" || job.tracks.length === 0) return 0;
	const done = job.tracks.filter((track) => track.status === "done").length;
	return Math.round((done / job.tracks.length) * 95);
}

/** Statuses where nothing more will happen. */
export function isJobFinished(status: JobStatus): boolean {
	return status === "done" || status === "failed";
}
