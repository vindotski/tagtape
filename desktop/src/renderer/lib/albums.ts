/** How many albums a guest keeps; older ones are dropped as new ones come. */
export const HISTORY_LIMIT = 50;

/** One album in a guest's history, as the lists show it (no links). */
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
	/** False for albums saved before TagTape kept track links: `tracks` is empty. */
	complete: boolean;
}
