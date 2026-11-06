import { z } from "zod";

/**
 * Job lifecycle. Nothing is stored: the download *is* the conversion.
 *
 * queued → probing → ready → (download starts) → [queued →] streaming → done
 * Any phase can end in `failed`. After `done`, or a failure while streaming,
 * the album can be downloaded again (it's converted again) until the job expires.
 */
export const jobStatusSchema = z.enum([
	/** Waiting for a free slot (to check the tracks, or to stream the download). */
	"queued",
	/** Reading each track's details; nothing is downloaded yet. */
	"probing",
	/** Every track checked; the download can start. */
	"ready",
	/** Tracks are being converted while the ZIP streams to the browser. */
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
	/**
	 * True when `GET /jobs/:id/archive` can start a (new) download: every track
	 * passed the check and no download is running right now.
	 */
	downloadReady: z.boolean(),
	createdAt: z.iso.datetime(),
	/** After this moment the job is forgotten. */
	expiresAt: z.iso.datetime(),
});
export type JobSnapshot = z.infer<typeof jobSnapshotSchema>;

export const createJobResponseSchema = z.object({ jobId: z.uuid() });
export type CreateJobResponse = z.infer<typeof createJobResponseSchema>;

/** Statuses where nothing happens until the user acts (or the job expires). */
export function isJobFinished(status: JobStatus): boolean {
	return status === "done" || status === "failed";
}
