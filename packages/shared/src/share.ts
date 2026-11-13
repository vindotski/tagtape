import { type Album, albumInputSchema } from "./album.ts";

/**
 * A shared album: what someone typed (details, track titles and links, the
 * cover's URL), so someone else can make the same album. Never media.
 *
 * It travels as a small JSON file (`.tagtape`) or inside a link, after the
 * `#`, where no server ever sees it. Either way it is untrusted on arrival:
 * decoding validates it with the same schema as the album form, and the app
 * only ever shows it in the editor; nothing starts by itself.
 */
export const SHARE_VERSION = 1;
/** File extension of a shared album, without the dot. */
export const SHARE_EXTENSION = "tagtape";
/** The link scheme the app answers to (`tagtape://open#a=…`). */
export const SHARE_SCHEME = "tagtape";
/** Largest shared album we read, as JSON text. Ten full tracks fit several times. */
export const MAX_SHARE_BYTES = 32 * 1024;

export type ShareResult =
	| { ok: true; album: Album }
	| { ok: false; message: string };

const NOT_AN_ALBUM = "This isn't a TagTape album";
const TOO_NEW =
	"This album was shared from a newer TagTape. Update TagTape to open it.";
const TOO_LARGE = "This is too large to be a TagTape album";

/** The album as the text of a `.tagtape` file. */
export function encodeShare(album: Album): string {
	// Listed by hand: only what the format holds leaves the app, in this order.
	return JSON.stringify(
		{
			tagtape: SHARE_VERSION,
			album: {
				title: album.title,
				artist: album.artist,
				...(album.genre ? { genre: album.genre } : {}),
				...(album.year ? { year: album.year } : {}),
				...(album.coverUrl ? { coverUrl: album.coverUrl } : {}),
				tracks: album.tracks.map(({ title, url }) => ({ title, url })),
			},
		},
		null,
		"\t",
	);
}

/** Reads the text of a `.tagtape` file. Never throws. */
export function decodeShare(text: string): ShareResult {
	// Characters are a lower bound for bytes: enough to refuse the absurd early.
	if (text.length > MAX_SHARE_BYTES) return { ok: false, message: TOO_LARGE };
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		return { ok: false, message: NOT_AN_ALBUM };
	}
	if (typeof data !== "object" || data === null || !("tagtape" in data)) {
		return { ok: false, message: NOT_AN_ALBUM };
	}
	const { tagtape: version, album } = data as {
		tagtape: unknown;
		album?: unknown;
	};
	if (typeof version !== "number") return { ok: false, message: NOT_AN_ALBUM };
	if (version > SHARE_VERSION) return { ok: false, message: TOO_NEW };
	const parsed = albumInputSchema.safeParse(album);
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		return {
			ok: false,
			message: issue ? `${NOT_AN_ALBUM}: ${issue.message}` : NOT_AN_ALBUM,
		};
	}
	return { ok: true, album: parsed.data };
}

/** The album as the part of a link after the `#`: `a=<base64url>`. */
export function shareFragment(album: Album): string {
	// Compact here: links should be as short as they can be.
	const json = JSON.stringify(JSON.parse(encodeShare(album)));
	return `a=${toBase64Url(new TextEncoder().encode(json))}`;
}

/**
 * Reads an album from a link's fragment (`#a=…`, with or without the `#`).
 * Never throws.
 */
export function albumFromFragment(fragment: string): ShareResult {
	const value = /^#?a=([A-Za-z0-9_-]+)$/.exec(fragment.trim())?.[1];
	if (!value) return { ok: false, message: NOT_AN_ALBUM };
	// Four characters carry three bytes.
	if (value.length > Math.ceil((MAX_SHARE_BYTES * 4) / 3)) {
		return { ok: false, message: TOO_LARGE };
	}
	const bytes = fromBase64Url(value);
	if (!bytes) return { ok: false, message: NOT_AN_ALBUM };
	let text: string;
	try {
		text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		return { ok: false, message: NOT_AN_ALBUM };
	}
	return decodeShare(text);
}

/** The fragment of a share link or of a `tagtape://open#a=…` link, if it has one. */
export function shareFragmentOf(link: string): string | null {
	const at = link.indexOf("#");
	return at === -1 ? null : link.slice(at);
}

// Written out because `Buffer` is Node's, and `btoa` takes a string of
// single-byte characters, not bytes.
const ALPHABET =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function toBase64Url(bytes: Uint8Array): string {
	let out = "";
	for (let i = 0; i < bytes.length; i += 3) {
		const a = bytes[i] as number;
		const b = bytes[i + 1];
		const c = bytes[i + 2];
		out += ALPHABET[a >> 2];
		out += ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)];
		if (b !== undefined) out += ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)];
		if (c !== undefined) out += ALPHABET[c & 63];
	}
	return out;
}

function fromBase64Url(text: string): Uint8Array | null {
	// A lone leftover character can't hold a byte.
	if (text.length % 4 === 1) return null;
	const bytes = new Uint8Array(Math.floor((text.length * 3) / 4));
	let at = 0;
	for (let i = 0; i < text.length; i += 4) {
		const [a, b, c, d] = [0, 1, 2, 3].map((n) => {
			const char = text[i + n];
			return char === undefined ? undefined : ALPHABET.indexOf(char);
		});
		if (a === undefined || b === undefined || a < 0 || b < 0) return null;
		if ((c !== undefined && c < 0) || (d !== undefined && d < 0)) return null;
		bytes[at++] = (a << 2) | (b >> 4);
		if (c !== undefined) bytes[at++] = ((b & 15) << 4) | (c >> 2);
		if (c !== undefined && d !== undefined) bytes[at++] = ((c & 3) << 6) | d;
	}
	return bytes;
}
