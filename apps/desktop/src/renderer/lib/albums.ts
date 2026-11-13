export type { AlbumSummary, StoredAlbum } from "../../ipc.ts";

/** How many albums the history keeps; older ones are dropped as new ones come. */
export const HISTORY_LIMIT = 50;
