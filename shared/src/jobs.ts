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

/** Statuses where nothing more will happen. */
export function isJobFinished(status: JobStatus): boolean {
	return status === "done" || status === "failed";
}
