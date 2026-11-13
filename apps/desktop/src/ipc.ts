// The contract between the window (renderer) and the main process. The
// preload script exposes exactly this as `window.tagtape`; the main process
// validates every argument again, since the renderer is the less trusted side.
import type { JobSnapshot, ShareResult } from "@tagtape/shared";

/** How many albums the library keeps; older ones are dropped as new ones come. */
export const HISTORY_LIMIT = 50;

/** A kind of link TagTape accepts (a built-in source, or one from a plugin). */
export interface SourceInfo {
	id: string;
	name: string;
}

/** Form errors keyed like the fields (`title`, `tracks.0.url`). */
export type FieldErrors = Record<string, string>;

export type StartJobResult =
	| { ok: true; jobId: string; albumId: string }
	| { ok: false; message: string; fieldErrors?: FieldErrors };

/** One album in the history, as the lists show it (no links). */
export interface AlbumSummary {
	id: string;
	title: string;
	artist: string;
	genre: string | null;
	year: number | null;
	trackCount: number;
	/** A small copy of the cover is kept (see `albumCover`). */
	hasCover: boolean;
	/** Goes up each time the kept cover is replaced, so the page fetches it again. */
	coverRevision: number;
	/** ISO 8601. */
	createdAt: string;
	/** ISO 8601: when it was last made (or made again). */
	updatedAt: string;
}

/** An album in full, so it can be opened and made again. */
export interface StoredAlbum extends AlbumSummary {
	coverUrl: string | null;
	tracks: { title: string; url: string }[];
	/**
	 * The album's folder: still where it was saved, gone from there (moved,
	 * renamed or deleted), or never saved (the album didn't finish).
	 */
	folder: "saved" | "missing" | "never";
}

/**
 * A screen the main process may ask the page to show (from the menu, or a
 * notification).
 */
export type Screen =
	| { screen: "new" | "library" | "settings" }
	| { screen: "album"; albumId: string }
	/** A shared album someone opened (a file or a link), or why it couldn't be read. */
	| { screen: "shared"; share: ShareResult };

/** What was picked from an album's right-click menu. */
export type AlbumMenuChoice =
	| "open"
	| "folder"
	| "again"
	| "delete"
	| ShareChoice;

/** How an album was shared: saved as a `.tagtape` file, or as a copied link. */
export type ShareChoice = "file" | "link";

export interface TagTapeApi {
	/** The app's version. */
	version: string;
	/** `process.platform`: the page leaves room for that system's window buttons. */
	platform: string;
	/** Calls `listener` when the app asks for a screen; returns the unsubscribe. */
	onNavigate(listener: (to: Screen) => void): () => void;
	/**
	 * Calls `listener` when the library changed behind the page's back (a
	 * finished album's folder and cover were kept); returns the unsubscribe.
	 */
	onLibraryChanged(listener: () => void): () => void;
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
	/** Shows the folder albums are saved in. */
	showDestination(): Promise<boolean>;
	/** Versions of the bundled programs, by name; empty if they don't run. */
	versions(): Promise<Record<string, string>>;
	/**
	 * Asks (a system dialog) and then forgets every album in the library;
	 * resolves to whether it did. Album folders are never touched.
	 */
	clearAlbums(): Promise<boolean>;
	/** Shows a finished job's album folder in the file manager. */
	showJobFolder(jobId: string): Promise<boolean>;
	/** Shows a stored album's folder, if it is still where it was saved. */
	showAlbumFolder(albumId: string): Promise<boolean>;
	/** The album's small cover as a `data:` URL, or null without one. */
	albumCover(albumId: string): Promise<string | null>;
	/**
	 * Pops up the ways to share a stored album (a file, a link) and does the
	 * one picked; resolves to it, or null if nothing was shared.
	 */
	shareAlbum(albumId: string): Promise<ShareChoice | null>;
	/**
	 * Pops up the album's menu at the pointer; resolves to what was picked, or
	 * null. "delete" has already been confirmed; "folder", "file" and "link"
	 * are already done.
	 */
	albumMenu(albumId: string): Promise<AlbumMenuChoice | null>;
	albums(limit: number): Promise<AlbumSummary[]>;
	album(id: string): Promise<StoredAlbum | null>;
	removeAlbum(id: string): Promise<boolean>;
}

// The two messages main sends the page; neither asks for an answer.
/** Show a screen (see `Screen`). */
export const NAVIGATE = "tagtape:navigate";
/** The library changed; carries nothing. */
export const LIBRARY_CHANGED = "tagtape:library-changed";

/** One IPC channel per method the page can call. */
export const CHANNELS = {
	sources: "tagtape:sources",
	startJob: "tagtape:start-job",
	job: "tagtape:job",
	cancelJob: "tagtape:cancel-job",
	destination: "tagtape:destination",
	chooseDestination: "tagtape:choose-destination",
	showDestination: "tagtape:show-destination",
	versions: "tagtape:versions",
	clearAlbums: "tagtape:clear-albums",
	showJobFolder: "tagtape:show-job-folder",
	showAlbumFolder: "tagtape:show-album-folder",
	albumCover: "tagtape:album-cover",
	albumMenu: "tagtape:album-menu",
	shareAlbum: "tagtape:share-album",
	albums: "tagtape:albums",
	album: "tagtape:album",
	removeAlbum: "tagtape:remove-album",
} as const;
