// The contract between the window (renderer) and the main process. The
// preload script exposes exactly this as `window.tagtape`; the main process
// validates every argument again, since the renderer is the less trusted side.
import type { JobSnapshot } from "@tagtape/shared";

/** A kind of link TagTape accepts (a built-in source, or one from a plugin). */
export interface SourceInfo {
	id: string;
	name: string;
}

/** Form errors keyed like the fields (`title`, `tracks.0.url`). */
export type FieldErrors = Record<string, string>;

export type StartJobResult =
	| { ok: true; jobId: string; albumId?: string }
	| { ok: false; message: string; fieldErrors?: FieldErrors };

/** One album in the history, as the lists show it (no links). */
export interface AlbumSummary {
	id: string;
	title: string;
	artist: string;
	genre: string | null;
	year: number | null;
	trackCount: number;
	/** ISO 8601. */
	createdAt: string;
	/** ISO 8601: when it was last made (or made again). */
	updatedAt: string;
}

/** An album in full, so it can be opened and made again. */
export interface StoredAlbum extends AlbumSummary {
	coverUrl: string | null;
	tracks: { title: string; url: string }[];
}

export interface TagTapeApi {
	/** The app's version, for the footer. */
	version: string;
	sources(): Promise<SourceInfo[]>;
	/** Starts an album; `albumId` is the stored album being made again, if any. */
	startJob(input: {
		album: unknown;
		albumId?: string;
	}): Promise<StartJobResult>;
	job(id: string): Promise<JobSnapshot | null>;
	cancelJob(id: string): Promise<boolean>;
	/** The folder albums are saved in. */
	destination(): Promise<string>;
	/** Opens the system folder dialog; resolves to the folder now in use. */
	chooseDestination(): Promise<string>;
	/** Shows a finished job's album folder in the file manager. */
	showJobFolder(jobId: string): Promise<boolean>;
	albums(limit: number): Promise<AlbumSummary[]>;
	album(id: string): Promise<StoredAlbum | null>;
	removeAlbum(id: string): Promise<boolean>;
}

/** One IPC channel per method. */
export const CHANNELS = {
	sources: "tagtape:sources",
	startJob: "tagtape:start-job",
	job: "tagtape:job",
	cancelJob: "tagtape:cancel-job",
	destination: "tagtape:destination",
	chooseDestination: "tagtape:choose-destination",
	showJobFolder: "tagtape:show-job-folder",
	albums: "tagtape:albums",
	album: "tagtape:album",
	removeAlbum: "tagtape:remove-album",
} as const;
