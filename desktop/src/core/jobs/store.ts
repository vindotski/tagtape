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
	/** What the source's probe returned for its stream step (in memory only). */
	state?: unknown;
}

/**
 * A job lives only in memory; restarting the app forgets every job. It holds
 * metadata and the cover image, never any audio.
 */
export interface Job {
	id: string;
	album: Album;
	/** The folder the user chose; the album gets its own folder inside it. */
	destination: string;
	/** The album's folder, once every track is saved. */
	folder?: string;
	status: JobStatus;
	tracks: TrackState[];
	error?: string;
	createdAt: Date;
	/** Set when the job ended (done or failed); it's forgotten a while later. */
	finishedAt?: Date;
	/** Squared JPEG cover, in memory while the job runs. */
	cover?: Buffer;
	/** Aborting cancels the job, whatever it's doing. */
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
		createdAt: job.createdAt.toISOString(),
	};
	if (job.error !== undefined) snapshot.error = job.error;
	if (job.folder !== undefined) snapshot.folder = job.folder;
	return snapshot;
}
