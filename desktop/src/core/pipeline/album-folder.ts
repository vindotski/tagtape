import { createWriteStream } from "node:fs";
import { mkdir, rename, rmdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/** Tried after the plain name: `Artist - Album (2)`, `(3)`, … */
const MAX_SUFFIX = 99;

/**
 * Creates the album's own folder inside `destination` and returns its path.
 * An existing folder is never reused or overwritten: the new one gets a
 * numbered suffix.
 */
export async function createAlbumFolder(
	destination: string,
	name: string,
): Promise<string> {
	await mkdir(destination, { recursive: true });
	for (let attempt = 1; attempt <= MAX_SUFFIX; attempt++) {
		const folder = join(
			destination,
			attempt === 1 ? name : `${name} (${attempt})`,
		);
		try {
			await mkdir(folder);
			return folder;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
		}
	}
	throw new Error(`Too many folders named "${name}" in ${destination}`);
}

/**
 * Writes one track: our ID3 tag, then the MP3 stream, into `<name>.part`,
 * renamed to `<name>` only once the stream ended cleanly. On any failure
 * (or when `signal` aborts) the partial file is removed and the error rethrown.
 */
export async function writeTrack(
	folder: string,
	name: string,
	tag: Uint8Array,
	mp3: Readable,
	signal: AbortSignal,
): Promise<string> {
	const path = join(folder, name);
	const part = `${path}.part`;
	const file = createWriteStream(part, { flags: "wx" });
	try {
		file.write(tag);
		await pipeline(mp3, file, { signal });
		await rename(part, path);
		return path;
	} catch (error) {
		mp3.destroy();
		file.destroy();
		await unlink(part).catch(() => {});
		throw error;
	}
}

/** Removes the files a failed album wrote, then its folder if nothing else is in it. */
export async function discardAlbum(
	folder: string,
	files: string[],
): Promise<void> {
	await Promise.all(files.map((file) => unlink(file).catch(() => {})));
	await rmdir(folder).catch(() => {});
}
