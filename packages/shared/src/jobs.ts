/**
 * Job lifecycle: queued → probing → streaming → done.
 * Any phase can end in `failed` (a cancelled job fails with "Cancelled").
 * A failed job leaves nothing on disk.
 */
export type JobStatus =
	/** Created; nothing has started yet. */
	| "queued"
	/** Reading each track's details; nothing is downloaded yet. */
	| "probing"
	/** Tracks are being converted and saved into the album's folder. */
	| "streaming"
	| "done"
	| "failed";

export type TrackStatus = "queued" | "converting" | "done" | "error";

export interface TrackSnapshot {
	/** 1-based track number (position in the album). */
	number: number;
	title: string;
	status: TrackStatus;
	/** Human-readable reason when `status` is `error`. */
	error?: string;
}

/** A job as the window sees it: plain data, sent from the main process. */
export interface JobSnapshot {
	id: string;
	status: JobStatus;
	tracks: TrackSnapshot[];
	/** Human-readable reason when `status` is `failed`. */
	error?: string;
	/** The album's folder, once every track is saved (`status` is `done`). */
	folder?: string;
	/** ISO 8601. */
	createdAt: string;
}

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
