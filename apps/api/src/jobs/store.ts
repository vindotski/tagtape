import type {
	Album,
	JobSnapshot,
	JobStatus,
	TrackStatus,
} from "@tagtape/shared";

export interface TrackState {
	/** 1-based position in the album. */
	number: number;
	title: string;
	url: string;
	status: TrackStatus;
	error?: string;
}

/** A job lives only in memory; restarting the API forgets every job (stateless by design). */
export interface Job {
	id: string;
	album: Album;
	status: JobStatus;
	tracks: TrackState[];
	error?: string;
	createdAt: Date;
	/** When the sweeper may delete the job and its files. Refreshed when the job finishes. */
	expiresAt: Date;
	/** Working directory: TMP_DIR/<id>. */
	dir: string;
	/** Set once the ZIP is written. */
	archivePath?: string;
	/** Download name, e.g. `Rick Astley - Whenever You Need Somebody.zip`. */
	archiveName?: string;
	/** Aborting kills this job's yt-dlp processes and downloads. */
	controller: AbortController;
}

export function toSnapshot(job: Job): JobSnapshot {
	const snapshot: JobSnapshot = {
		id: job.id,
		status: job.status,
		tracks: job.tracks.map(({ number, title, status, error }) =>
			error === undefined
				? { number, title, status }
				: { number, title, status, error },
		),
		archiveReady: job.archivePath !== undefined,
		createdAt: job.createdAt.toISOString(),
		expiresAt: job.expiresAt.toISOString(),
	};
	if (job.error !== undefined) snapshot.error = job.error;
	return snapshot;
}
