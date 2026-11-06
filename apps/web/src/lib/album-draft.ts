import { type AlbumInput, albumInputSchema } from "@tagtape/shared";

/** What the form edits. Tracks carry a client-only `key` for React and drag-and-drop. */
export interface TrackDraft {
	key: string;
	title: string;
	url: string;
}

export interface AlbumDraft {
	title: string;
	artist: string;
	genre: string;
	year: string;
	coverUrl: string;
	tracks: TrackDraft[];
}

/** Only called from event handlers, so it always runs in the browser. */
export function newTrack(): TrackDraft {
	return { key: crypto.randomUUID(), title: "", url: "" };
}

export function emptyDraft(): AlbumDraft {
	return {
		title: "",
		artist: "",
		genre: "",
		year: "",
		coverUrl: "",
		tracks: [{ key: "track-initial", title: "", url: "" }],
	};
}

export function toAlbumInput(draft: AlbumDraft): AlbumInput {
	return {
		title: draft.title,
		artist: draft.artist,
		genre: draft.genre,
		year: draft.year,
		coverUrl: draft.coverUrl,
		tracks: draft.tracks.map(({ title, url }) => ({ title, url })),
	};
}

export type FieldErrors = Record<string, string>;

/** Validates with the shared schema; errors are keyed `title`, `tracks.0.url`, … */
export function validateDraft(
	draft: AlbumDraft,
): { ok: true; input: AlbumInput } | { ok: false; errors: FieldErrors } {
	const input = toAlbumInput(draft);
	const result = albumInputSchema.safeParse(input);
	if (result.success) return { ok: true, input };
	const errors: FieldErrors = {};
	for (const issue of result.error.issues) {
		const key = issue.path.join(".");
		if (!(key in errors)) errors[key] = issue.message;
	}
	return { ok: false, errors };
}

/** Moves the track at `from` to `to`, returning a new array. */
export function moveTrack(
	tracks: TrackDraft[],
	from: number,
	to: number,
): TrackDraft[] {
	if (from === to || to < 0 || to >= tracks.length) return tracks;
	const next = [...tracks];
	const [moved] = next.splice(from, 1);
	if (moved) next.splice(to, 0, moved);
	return next;
}
