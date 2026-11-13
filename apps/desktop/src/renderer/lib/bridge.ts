// Everything the page asks of the app goes through `window.tagtape`, the
// narrow API the preload script exposes (see src/ipc.ts). These wrappers keep
// the names the components always used.
import type { JobSnapshot } from "@tagtape/shared";
import type {
	AlbumMenuChoice,
	AlbumSummary,
	Screen,
	ShareChoice,
	SourceInfo,
	StartJobResult,
	StoredAlbum,
	TagTapeApi,
} from "../../ipc.ts";

declare global {
	interface Window {
		tagtape: TagTapeApi;
	}
}

export const appVersion = (): string => window.tagtape.version;

/** Which system's window buttons the page must leave room for. */
export const appPlatform = (): string => window.tagtape.platform;

/** Follows the app's requests for a screen (menu items, notifications). */
export const onNavigate = (listener: (to: Screen) => void): (() => void) =>
	window.tagtape.onNavigate(listener);

/** Follows changes to the library the page didn't make itself. */
export const onLibraryChanged = (listener: () => void): (() => void) =>
	window.tagtape.onLibraryChanged(listener);

/** The kinds of links this app accepts; an empty list if that can't be read. */
export const fetchSources = (): Promise<SourceInfo[]> =>
	window.tagtape.sources().catch(() => []);

export const startJob = (input: {
	album: unknown;
	albumId?: string | undefined;
}): Promise<StartJobResult> =>
	window.tagtape.startJob(
		input.albumId
			? { album: input.album, albumId: input.albumId }
			: { album: input.album },
	);

export const fetchJob = (id: string): Promise<JobSnapshot | null> =>
	window.tagtape.job(id);

export const cancelJob = (id: string): Promise<boolean> =>
	window.tagtape.cancelJob(id);

export const fetchDestination = (): Promise<string> =>
	window.tagtape.destination();

export const chooseDestination = (): Promise<string> =>
	window.tagtape.chooseDestination();

export const showDestination = (): Promise<boolean> =>
	window.tagtape.showDestination().catch(() => false);

export const fetchVersions = (): Promise<Record<string, string>> =>
	window.tagtape.versions().catch(() => ({}));

export const clearAlbums = (): Promise<boolean> =>
	window.tagtape.clearAlbums().catch(() => false);

export const showJobFolder = (jobId: string): Promise<boolean> =>
	window.tagtape.showJobFolder(jobId);

export const showAlbumFolder = (albumId: string): Promise<boolean> =>
	window.tagtape.showAlbumFolder(albumId).catch(() => false);

export const fetchAlbumCover = (albumId: string): Promise<string | null> =>
	window.tagtape.albumCover(albumId).catch(() => null);

export const shareAlbum = (albumId: string): Promise<ShareChoice | null> =>
	window.tagtape.shareAlbum(albumId).catch(() => null);

export const albumMenu = (albumId: string): Promise<AlbumMenuChoice | null> =>
	window.tagtape.albumMenu(albumId).catch(() => null);

export const fetchAlbums = (limit: number): Promise<AlbumSummary[]> =>
	window.tagtape.albums(limit).catch(() => []);

export const fetchAlbum = (id: string): Promise<StoredAlbum | null> =>
	window.tagtape.album(id);

export const removeAlbum = (id: string): Promise<boolean> =>
	window.tagtape.removeAlbum(id).catch(() => false);
