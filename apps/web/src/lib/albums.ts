/** One album in a guest's history, as the page shows it (no links, no media). */
export interface AlbumSummary {
	id: string;
	title: string;
	artist: string;
	genre: string | null;
	year: number | null;
	trackCount: number;
	/** ISO 8601. */
	createdAt: string;
}
