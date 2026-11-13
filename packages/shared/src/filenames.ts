// Characters that are illegal in file names on Windows, macOS or Linux, plus
// control characters. Everything else, including non-Latin scripts and emoji,
// is kept (TagTape v1 replaced anything outside [A-Za-z0-9] with "-").
// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;
const MAX_BASENAME_LENGTH = 120;
/**
 * File systems limit a name to 255 UTF-8 bytes (Linux) or UTF-16 units
 * (macOS, Windows), not characters: 120 CJK characters are 360 bytes. 200
 * leaves room for what gets added around the name: `07 - `, `.mp3.part`,
 * and ` (99)` on a repeated album folder.
 */
const MAX_BASENAME_BYTES = 200;

/** UTF-8 length of one code point. */
function utf8Bytes(character: string): number {
	const code = character.codePointAt(0) ?? 0;
	if (code < 0x80) return 1;
	if (code < 0x800) return 2;
	return code < 0x10000 ? 3 : 4;
}

/** Cuts at whole characters, within both the character and the byte limit. */
function truncate(text: string): string {
	let bytes = 0;
	let kept = "";
	let count = 0;
	for (const character of text) {
		bytes += utf8Bytes(character);
		if (++count > MAX_BASENAME_LENGTH || bytes > MAX_BASENAME_BYTES) break;
		kept += character;
	}
	return kept;
}

/** Makes `name` safe to use as a file name while keeping it readable. */
export function safeFileName(name: string, fallback: string): string {
	const cleaned = name
		.normalize("NFC")
		.replace(ILLEGAL, " ")
		.replace(/\s+/g, " ")
		.trim()
		// Windows drops trailing dots and spaces; a leading dot hides the file.
		.replace(/^[.\s]+|[.\s]+$/g, "");
	// Trimmed again: the cut may land after a space, or before a dot.
	const truncated = truncate(cleaned).replace(/[.\s]+$/g, "");
	return truncated || fallback;
}

/** `07 - Title.mp3`, zero-padded so tracks sort correctly everywhere. */
export function trackFileName(
	number: number,
	total: number,
	title: string,
): string {
	const width = Math.max(2, String(total).length);
	const prefix = String(number).padStart(width, "0");
	return `${prefix} - ${safeFileName(title, `Track ${number}`)}.mp3`;
}

/** `Artist - Album`: the folder an album is saved in. */
export function albumFolderName(artist: string, album: string): string {
	return safeFileName(`${artist} - ${album}`, "TagTape");
}
