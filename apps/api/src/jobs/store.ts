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
	/** Canonical URL, as the source matched it. */
	url: string;
	/** Id of the source that handles this track. */
	source: string;
	status: TrackStatus;
	error?: string;
	/** Set once the probe succeeded. */
	probed: boolean;
	/** What the source's probe returned for its stream step (in memory only). */
	state?: unknown;
}

/**
 * A job lives only in memory; restarting the API forgets every job (stateless
 * by design). It holds metadata and the cover image, never any audio.
 */
export interface Job {
	id: string;
	album: Album;
	status: JobStatus;
	tracks: TrackState[];
	error?: string;
	createdAt: Date;
	/** When the sweeper may forget the job. Refreshed when a phase ends. */
	expiresAt: Date;
	/** Squared JPEG cover, in memory. */
	cover?: Buffer;
	/** Aborting cancels the probe phase. Each download has its own signal. */
	controller: AbortController;
}

/** Every track probed successfully: the album can be streamed. */
export function isProbed(job: Job): boolean {
	return job.tracks.every((track) => track.probed);
}

/** A download can start now: probed, and no download queued or running. */
export function canStream(job: Job): boolean {
	return (
		isProbed(job) &&
		(job.status === "ready" || job.status === "done" || job.status === "failed")
	);
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
		downloadReady: canStream(job),
		createdAt: job.createdAt.toISOString(),
		expiresAt: job.expiresAt.toISOString(),
	};
	if (job.error !== undefined) snapshot.error = job.error;
	return snapshot;
}
