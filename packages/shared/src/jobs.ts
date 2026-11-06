import { z } from "zod";

export const jobStatusSchema = z.enum([
	"queued",
	"probing",
	"processing",
	"packaging",
	"done",
	"failed",
]);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const trackStatusSchema = z.enum([
	"queued",
	"downloading",
	"converting",
	"tagging",
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
	/** True once the ZIP can be downloaded from `GET /jobs/:id/archive`. */
	archiveReady: z.boolean(),
	createdAt: z.iso.datetime(),
	/** After this moment the job and its files are deleted. */
	expiresAt: z.iso.datetime(),
});
export type JobSnapshot = z.infer<typeof jobSnapshotSchema>;

export const createJobResponseSchema = z.object({ jobId: z.uuid() });
export type CreateJobResponse = z.infer<typeof createJobResponseSchema>;

/** Statuses after which a job never changes again; clients stop polling. */
export function isJobFinished(status: JobStatus): boolean {
	return status === "done" || status === "failed";
}
