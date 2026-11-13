// Characters that are illegal in file names on Windows, macOS or Linux, plus
// control characters. Everything else, including non-Latin scripts and emoji,
// is kept (TagTape v1 replaced anything outside [A-Za-z0-9] with "-").
// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;
const MAX_BASENAME_LENGTH = 120;

/** Makes `name` safe to use as a file name while keeping it readable. */
export function safeFileName(name: string, fallback: string): string {
	const cleaned = name
		.normalize("NFC")
		.replace(ILLEGAL, " ")
		.replace(/\s+/g, " ")
		.trim()
		// Windows drops trailing dots and spaces; a leading dot hides the file.
		.replace(/^[.\s]+|[.\s]+$/g, "");
	const truncated = Array.from(cleaned)
		.slice(0, MAX_BASENAME_LENGTH)
		.join("")
		.trim();
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
