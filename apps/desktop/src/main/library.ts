import { randomUUID } from "node:crypto";
import {
	copyFile,
	mkdir,
	readFile,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Album } from "@tagtape/shared";
import { z } from "zod";
import { type AlbumSummary, HISTORY_LIMIT } from "../ipc.ts";

export { HISTORY_LIMIT };

const storedAlbumSchema = z.object({
	id: z.uuid(),
	title: z.string(),
	artist: z.string(),
	genre: z.string().nullable(),
	year: z.number().nullable(),
	trackCount: z.number(),
	createdAt: z.string(),
	updatedAt: z.string(),
	coverUrl: z.string().nullable(),
	tracks: z.array(z.object({ title: z.string(), url: z.string() })),
	/** Where the album was last saved; unset until one has finished. */
	folder: z.string().optional(),
	/** A small copy of the cover is in the covers folder. */
	hasCover: z.boolean().optional(),
	/** How many times a cover was kept; stays when the cover goes. */
	coverRevision: z.number().optional(),
});
/** An album as the file holds it. */
export type LibraryAlbum = z.infer<typeof storedAlbumSchema>;

const fileSchema = z.object({
	version: z.literal(1),
	/** The folder albums are saved in; unset until the user picks one. */
	destination: z.string().optional(),
	// Checked one by one (see `load`): one bad entry must not cost the rest.
	albums: z.array(z.unknown()),
});
interface LibraryFile {
	version: 1;
	destination?: string;
	albums: LibraryAlbum[];
}

/**
 * What TagTape remembers on this computer, in one small JSON file: the albums
 * as they were typed (details, track titles and links, the cover's URL), so
 * they can be opened and made again, where each was saved, and where albums
 * are saved. Next to it, a folder with one small JPEG per album that has a
 * cover. Never media.
 */
export interface Library {
	/**
	 * Stores a started album, or updates `albumId`; resolves to its id. A new
	 * album gets `newId` when given, so a caller can know the id before the
	 * write has happened.
	 */
	record(
		album: Album,
		albumId: string | undefined,
		newId?: string,
	): Promise<string>;
	/**
	 * Notes where a finished album was saved and keeps its small cover (or
	 * drops the old one when it was made without). A kept cover gets the next
	 * `coverRevision`. False if the album is gone.
	 */
	finished(
		albumId: string,
		result: { folder: string; cover?: Uint8Array | undefined },
	): Promise<boolean>;
	/** The album's small cover (a JPEG), or null without one. */
	cover(id: string): Promise<Buffer | null>;
	/** Most recently made first. */
	list(limit: number): Promise<AlbumSummary[]>;
	get(id: string): Promise<LibraryAlbum | null>;
	remove(id: string): Promise<boolean>;
	/** Forgets every album and its cover; resolves to how many there were. */
	clear(): Promise<number>;
	destination(): Promise<string | undefined>;
	setDestination(folder: string): Promise<void>;
}

export function openLibrary(
	file: string,
	options: {
		now?: () => Date;
		/** Told when the file on disk couldn't be read in full. */
		onUnreadable?: (backup: string) => void;
	} = {},
): Library {
	const now = options.now ?? (() => new Date());
	const covers = join(dirname(file), "covers");
	const coverFile = (id: string) => join(covers, `${id}.jpg`);
	const dropCovers = (albums: LibraryAlbum[]) =>
		Promise.all(
			albums
				.filter((album) => album.hasCover)
				.map((album) => rm(coverFile(album.id), { force: true })),
		);
	let cache: LibraryFile | undefined;
	/** The file held something that wasn't understood: copy it before replacing it. */
	let backupFirst = false;
	const backup = `${file}.unreadable`;
	// One change at a time, so two quick saves can't interleave.
	let queue: Promise<unknown> = Promise.resolve();

	async function load(): Promise<LibraryFile> {
		if (cache) return cache;
		let text: string | undefined;
		try {
			text = await readFile(file, "utf8");
		} catch (error) {
			// No file yet is the normal first start. Any other read error is
			// not a reason to start over: fail, and try again next time.
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
		cache = { version: 1, albums: [] };
		if (text === undefined) return cache;
		try {
			const parsed = fileSchema.parse(JSON.parse(text));
			if (parsed.destination) cache.destination = parsed.destination;
			for (const entry of parsed.albums) {
				const album = storedAlbumSchema.safeParse(entry);
				if (album.success) cache.albums.push(album.data);
				else backupFirst = true;
			}
		} catch {
			// Damaged, or written by a newer TagTape: start empty, but keep
			// the file (see `update`).
			backupFirst = true;
		}
		return cache;
	}

	/** Applies `change` and writes the file atomically (a temp file, renamed). */
	function update<T>(
		change: (data: LibraryFile) => T | Promise<T>,
	): Promise<T> {
		const run = queue.then(async () => {
			const data = await load();
			const result = await change(data);
			await mkdir(dirname(file), { recursive: true });
			if (backupFirst) {
				// About to replace a file that wasn't fully understood.
				await copyFile(file, backup);
				backupFirst = false;
				options.onUnreadable?.(backup);
			}
			const temp = `${file}.${process.pid}.tmp`;
			await writeFile(temp, JSON.stringify(data, null, "\t"), { mode: 0o600 });
			await rename(temp, file);
			return result;
		});
		queue = run.catch(() => {});
		return run;
	}

	const summary = ({
		coverUrl: _coverUrl,
		tracks: _tracks,
		folder: _folder,
		hasCover,
		coverRevision,
		...rest
	}: LibraryAlbum): AlbumSummary => ({
		...rest,
		hasCover: hasCover === true,
		coverRevision: coverRevision ?? 0,
	});

	return {
		record(album, albumId, newId) {
			return update(async (data) => {
				const at = now().toISOString();
				const existing = albumId
					? data.albums.find((stored) => stored.id === albumId)
					: undefined;
				const stored: LibraryAlbum = {
					id: existing?.id ?? newId ?? randomUUID(),
					title: album.title,
					artist: album.artist,
					genre: album.genre ?? null,
					year: album.year ? Number(album.year) : null,
					trackCount: album.tracks.length,
					createdAt: existing?.createdAt ?? at,
					updatedAt: at,
					coverUrl: album.coverUrl ?? null,
					tracks: album.tracks.map(({ title, url }) => ({ title, url })),
					// Until this run finishes, the last one's folder and cover stand.
					...(existing?.folder ? { folder: existing.folder } : {}),
					...(existing?.hasCover ? { hasCover: true } : {}),
					...(existing?.coverRevision
						? { coverRevision: existing.coverRevision }
						: {}),
				};
				const all = [
					stored,
					...data.albums.filter((other) => other.id !== stored.id),
				];
				data.albums = all.slice(0, HISTORY_LIMIT);
				await dropCovers(all.slice(HISTORY_LIMIT));
				return stored.id;
			});
		},

		finished(albumId, { folder, cover }) {
			return update(async (data) => {
				const stored = data.albums.find((album) => album.id === albumId);
				if (!stored) return false;
				if (cover) {
					await mkdir(covers, { recursive: true });
					const temp = `${coverFile(albumId)}.${process.pid}.tmp`;
					await writeFile(temp, cover, { mode: 0o600 });
					await rename(temp, coverFile(albumId));
					stored.hasCover = true;
					// `updatedAt` was set when this run started, and the old cover
					// may have been shown since: the new one needs its own mark.
					stored.coverRevision = (stored.coverRevision ?? 0) + 1;
				} else if (stored.hasCover) {
					await rm(coverFile(albumId), { force: true });
					delete stored.hasCover;
				}
				stored.folder = folder;
				return true;
			});
		},

		async cover(id) {
			const stored = (await load()).albums.find((album) => album.id === id);
			if (!stored?.hasCover) return null;
			return readFile(coverFile(id)).catch(() => null);
		},

		async list(limit) {
			const { albums } = await load();
			return albums.slice(0, limit).map(summary);
		},

		async get(id) {
			const { albums } = await load();
			return albums.find((stored) => stored.id === id) ?? null;
		},

		remove(id) {
			return update(async (data) => {
				const removed = data.albums.filter((stored) => stored.id === id);
				data.albums = data.albums.filter((stored) => stored.id !== id);
				await dropCovers(removed);
				return removed.length > 0;
			});
		},

		clear() {
			return update(async (data) => {
				const removed = data.albums;
				data.albums = [];
				await dropCovers(removed);
				return removed.length;
			});
		},

		async destination() {
			return (await load()).destination;
		},

		async setDestination(folder) {
			await update((data) => {
				data.destination = folder;
			});
		},
	};
}
