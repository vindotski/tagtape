import type { Album } from "@tagtape/shared";
import type { AlbumSummary, StoredAlbum } from "../ipc.ts";

/**
 * The albums this computer has made, so they can be opened and made again.
 * Not kept yet: this stub remembers nothing.
 */
export interface AlbumHistory {
	/** Stores a started album (or updates `albumId`); resolves to its id. */
	record(
		album: Album,
		albumId: string | undefined,
	): Promise<string | undefined>;
	list(limit: number): Promise<AlbumSummary[]>;
	get(id: string): Promise<StoredAlbum | null>;
	remove(id: string): Promise<boolean>;
}

export function emptyHistory(): AlbumHistory {
	return {
		record: async () => undefined,
		list: async () => [],
		get: async () => null,
		remove: async () => false,
	};
}
