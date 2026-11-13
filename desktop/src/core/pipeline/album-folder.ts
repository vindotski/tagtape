import { once } from "node:events";
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
		// A cancel that arrives once the stream has ended still counts: the
		// track must not appear after the user was told it was cancelled.
		signal.throwIfAborted();
		await rename(part, path);
		if (signal.aborted) {
			await removeFile(path);
			signal.throwIfAborted();
		}
		return path;
	} catch (error) {
		mp3.destroy();
		file.destroy();
		// Windows can't remove a folder while a file in it is still open: wait
		// for the handle to be released before cleaning up.
		if (!file.closed) await once(file, "close").catch(() => {});
		await removeFile(part);
		throw error;
	}
}

const RETRIES = 5;
const RETRY_DELAY_MS = 100;
/** What Windows answers while something still holds a file or folder. */
const TRANSIENT = new Set(["EBUSY", "EPERM", "ENOTEMPTY"]);

const pause = () =>
	new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));

/**
 * Removes a file, retrying while the system still holds it. (`fs.rm` only
 * retries with `recursive`, which must never be used on a user's folder.)
 */
export async function removeFile(
	path: string,
	remove: (path: string) => Promise<void> = unlink,
): Promise<void> {
	for (let attempt = 0; attempt < RETRIES; attempt++) {
		try {
			await remove(path);
			return;
		} catch (error) {
			const { code } = error as NodeJS.ErrnoException;
			if (!code || !TRANSIENT.has(code)) return; // gone already, or not ours to fix
			await pause();
		}
	}
}

/** Removes a folder if it's empty, giving a just-deleted file a moment to go. */
async function removeEmptyFolder(folder: string): Promise<void> {
	for (let attempt = 0; attempt < RETRIES; attempt++) {
		try {
			await rmdir(folder);
			return;
		} catch (error) {
			const { code } = error as NodeJS.ErrnoException;
			// ENOTEMPTY is also what a folder with someone else's files says:
			// a few short tries, then leave it.
			if (!code || !TRANSIENT.has(code)) return;
			await pause();
		}
	}
}

/** Removes the files a failed album wrote, then its folder if nothing else is in it. */
export async function discardAlbum(
	folder: string,
	files: string[],
): Promise<void> {
	await Promise.all(files.map((file) => removeFile(file)));
	await removeEmptyFolder(folder);
}
