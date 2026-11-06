/** Limits shared by the form, the server-function layer and the API. */

export const MAX_TRACKS = 10;

/** Longest track we accept, in seconds (10 minutes, same as legacy). */
export const MAX_TRACK_SECONDS = 600;

/** Largest cover image we download before re-encoding, in bytes. */
export const MAX_COVER_BYTES = 5 * 1024 * 1024;

export const MAX_TITLE_LENGTH = 60;
export const MAX_ARTIST_LENGTH = 60;
export const MAX_GENRE_LENGTH = 30;
