import { randomUUID } from "node:crypto";
import { rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	albumFolderName,
	albumInputSchema,
	encodeShare,
	isJobFinished,
	type JobSnapshot,
	SHARE_EXTENSION,
	shareFragment,
} from "@tagtape/shared";
import {
	type BrowserWindow,
	clipboard,
	dialog,
	ipcMain,
	Menu,
	type MenuItemConstructorOptions,
	shell,
} from "electron";
import { z } from "zod";
import type { TagTape } from "../core/index.ts";
import { thumbnail } from "../core/pipeline/cover.ts";
import {
	type AlbumMenuChoice,
	CHANNELS,
	type FieldErrors,
	LIBRARY_CHANGED,
	type ShareChoice,
	type StartJobResult,
	type TagTapeApi,
} from "../ipc.ts";
import type { Library, LibraryAlbum } from "./library.ts";
import { LINKS } from "./links.ts";

const idSchema = z.uuid();
const startSchema = z.object({
	album: z.unknown(),
	albumId: z.uuid().optional(),
});
const limitSchema = z.int().min(1).max(100);

export interface IpcContext {
	tagtape: TagTape;
	library: Library;
	window: () => BrowserWindow | undefined;
	/** Where albums go until the user picks a folder (Downloads). */
	defaultDestination: string;
	log: { error(obj: object, msg: string): void };
	/** An album ended (saved, failed or cancelled). */
	onFinished?: (
		job: JobSnapshot,
		album: { title: string; albumId: string | undefined },
	) => void;
}

type Handlers = {
	[K in keyof Omit<
		TagTapeApi,
		"version" | "platform" | "onNavigate" | "onLibraryChanged"
	>]: (...args: unknown[]) => ReturnType<TagTapeApi[K]>;
};

/**
 * Registers one handler per channel. Every argument arrives as `unknown` and
 * is validated here: the page is never trusted to send the right shape.
 */
export function registerIpc(ctx: IpcContext): {
	/** Opens the folder albums are saved in. */
	showDestination(): Promise<boolean>;
} {
	const isFolder = (path: string) =>
		stat(path).then(
			(info) => info.isDirectory(),
			() => false,
		);

	/**
	 * Opens a folder in the file manager. One whose name the system would
	 * treat as something to launch (an album called "Name.app" on macOS) is
	 * shown in its parent instead.
	 */
	async function showFolder(folder: string): Promise<boolean> {
		if (/\.(app|bundle|framework|plugin|kext)$/i.test(folder)) {
			shell.showItemInFolder(folder);
			return true;
		}
		return (await shell.openPath(folder)) === "";
	}

	/** The remembered folder, if it still exists; otherwise the default. */
	async function destination(): Promise<string> {
		const remembered = await ctx.library.destination().catch(() => undefined);
		if (remembered && (await isFolder(remembered))) return remembered;
		return ctx.defaultDestination;
	}

	/** A stored album as the share format wants it; null if it no longer fits. */
	const shareable = (stored: LibraryAlbum) =>
		albumInputSchema.safeParse({
			title: stored.title,
			artist: stored.artist,
			genre: stored.genre ?? "",
			year: stored.year === null ? "" : String(stored.year),
			coverUrl: stored.coverUrl ?? "",
			tracks: stored.tracks,
		}).data ?? null;

	/** Shares a stored album as a file (after a save dialog) or a copied link. */
	async function share(
		stored: LibraryAlbum,
		how: ShareChoice,
	): Promise<ShareChoice | null> {
		const album = shareable(stored);
		if (!album) return null;
		if (how === "link") {
			clipboard.writeText(`${LINKS.open}#${shareFragment(album)}`);
			return "link";
		}
		const window = ctx.window();
		const options = {
			title: "Save the album to share",
			defaultPath: join(
				await destination(),
				`${albumFolderName(album.artist, album.title)}.${SHARE_EXTENSION}`,
			),
			filters: [{ name: "TagTape album", extensions: [SHARE_EXTENSION] }],
		};
		const { canceled, filePath } = window
			? await dialog.showSaveDialog(window, options)
			: await dialog.showSaveDialog(options);
		if (canceled || !filePath) return null;
		try {
			// A temp file, renamed: never a half-written share.
			const temp = `${filePath}.${process.pid}.tmp`;
			await writeFile(temp, encodeShare(album));
			await rename(temp, filePath);
			return "file";
		} catch (error) {
			ctx.log.error({ err: error }, "Saving the shared album failed");
			dialog.showErrorBox("The album couldn't be saved", "Try another folder.");
			return null;
		}
	}

	/** Pops up `template`; resolves to the value of the item clicked, or null. */
	function popup<T>(
		window: BrowserWindow,
		template: (pick: (value: T) => () => void) => MenuItemConstructorOptions[],
	): Promise<T | null> {
		return new Promise((resolve) => {
			// A click resolves at once. Closing the menu resolves to nothing, a
			// moment later: on some systems "closed" arrives before the click.
			Menu.buildFromTemplate(template((value) => () => resolve(value))).popup({
				window,
				callback: () => setTimeout(() => resolve(null), 200),
			});
		});
	}
	const shareItems = (
		pick: (value: ShareChoice) => () => void,
	): MenuItemConstructorOptions[] => [
		{ label: "Save as File…", click: pick("file") },
		{ label: "Copy Link", click: pick("link") },
	];

	// A finished album's folder and cover go into the library. Its library id
	// is settled before the job starts, so nothing here waits on a disk write.
	type Finished = { folder: string; cover: Uint8Array | undefined };
	const albumOfJob = new Map<string, string>();
	const titleOfJob = new Map<string, string>();
	/** Tells the page the library changed behind its back. */
	const libraryChanged = () => {
		const page = ctx.window()?.webContents;
		if (page && !page.isDestroyed()) page.send(LIBRARY_CHANGED);
	};
	async function remember(albumId: string, result: Finished): Promise<void> {
		try {
			// A cover that can't be shrunk must not cost the album its folder.
			const cover =
				result.cover &&
				(await thumbnail(result.cover).catch((error: unknown) => {
					ctx.log.error({ err: error }, "Making the cover thumbnail failed");
					return undefined;
				}));
			const kept = await ctx.library.finished(albumId, {
				folder: result.folder,
				cover,
			});
			// The page may be showing this album with its old cover and folder.
			if (kept) libraryChanged();
		} catch (error) {
			ctx.log.error({ err: error }, "Remembering the finished album failed");
		}
	}
	ctx.tagtape.subscribe((job) => {
		if (!isJobFinished(job.status)) return;
		const albumId = albumOfJob.get(job.id);
		albumOfJob.delete(job.id);
		const title = titleOfJob.get(job.id) ?? "";
		titleOfJob.delete(job.id);
		ctx.onFinished?.(job, { title, albumId });
		if (job.status !== "done" || !job.folder) return;
		// The cover is only in memory during this call.
		const result = { folder: job.folder, cover: ctx.tagtape.jobCover(job.id) };
		// The library writes one change at a time, in order: this lands after
		// the album's own entry, however quickly the job ended.
		if (albumId) void remember(albumId, result);
	});

	const handlers: Handlers = {
		sources: async () => ctx.tagtape.sources(),

		async startJob(input): Promise<StartJobResult> {
			const parsed = startSchema.safeParse(input);
			if (!parsed.success) {
				return {
					ok: false,
					message: "Something went wrong. Please try again.",
				};
			}
			// The album's library id, known up front: the one being made again
			// if it is still there, a new one otherwise. (History is a
			// convenience: if it can't be read, the album is still made.)
			const again = parsed.data.albumId;
			const existing =
				again && (await ctx.library.get(again).catch(() => null))
					? again
					: undefined;
			const albumId = existing ?? randomUUID();

			const outcome = ctx.tagtape.createJob(
				parsed.data.album,
				await destination(),
			);
			if (outcome.kind === "invalid") {
				const fieldErrors: FieldErrors = {};
				for (const issue of outcome.issues) {
					fieldErrors[issue.path] ??= issue.message;
				}
				return {
					ok: false,
					message: "Some fields need another look.",
					fieldErrors,
				};
			}
			if (outcome.kind === "busy") {
				return { ok: false, message: outcome.message };
			}
			titleOfJob.set(outcome.jobId, outcome.album.title);
			albumOfJob.set(outcome.jobId, albumId);
			// Written behind the answer: the page can follow and cancel the job
			// at once, whatever the disk is doing.
			void ctx.library
				.record(outcome.album, existing, albumId)
				.then(libraryChanged, (error: unknown) =>
					ctx.log.error({ err: error }, "Recording the album failed"),
				);
			return { ok: true, jobId: outcome.jobId, albumId };
		},

		async job(id) {
			const parsed = idSchema.safeParse(id);
			return parsed.success ? (ctx.tagtape.getJob(parsed.data) ?? null) : null;
		},

		async cancelJob(id) {
			const parsed = idSchema.safeParse(id);
			return parsed.success ? ctx.tagtape.cancelJob(parsed.data) : false;
		},

		destination,

		async chooseDestination() {
			const window = ctx.window();
			const options = {
				title: "Where should albums be saved?",
				defaultPath: await destination(),
				properties: ["openDirectory", "createDirectory"] as Array<
					"openDirectory" | "createDirectory"
				>,
			};
			const result = window
				? await dialog.showOpenDialog(window, options)
				: await dialog.showOpenDialog(options);
			const folder = result.filePaths[0];
			if (!result.canceled && folder) {
				try {
					await ctx.library.setDestination(folder);
					return folder;
				} catch (error) {
					// Not remembered means not used: show the folder still in use.
					ctx.log.error({ err: error }, "Remembering the folder failed");
				}
			}
			return destination();
		},

		async showDestination() {
			return showFolder(await destination());
		},

		async versions() {
			return ctx.tagtape.versions().catch(() => ({}));
		},

		async clearAlbums() {
			const window = ctx.window();
			const count = (await ctx.library.list(100).catch(() => [])).length;
			if (count === 0) return false;
			const options = {
				type: "warning" as const,
				buttons: ["Cancel", "Clear Library"],
				defaultId: 0,
				cancelId: 0,
				message:
					count === 1
						? "Forget the album in the library?"
						: `Forget all ${count} albums in the library?`,
				detail:
					"TagTape forgets what you typed and the small covers. The album folders and their MP3s stay where they are.",
			};
			const { response } = window
				? await dialog.showMessageBox(window, options)
				: await dialog.showMessageBox(options);
			if (response !== 1) return false;
			try {
				await ctx.library.clear();
				return true;
			} catch (error) {
				ctx.log.error({ err: error }, "Clearing the library failed");
				return false;
			}
		},

		// By job id, never by path: the page can't make the app open arbitrary files.
		async showJobFolder(jobId) {
			const parsed = idSchema.safeParse(jobId);
			const folder = parsed.success
				? ctx.tagtape.getJob(parsed.data)?.folder
				: undefined;
			if (!folder || !(await isFolder(folder))) return false;
			return showFolder(folder);
		},

		// By album id, for the same reason.
		async showAlbumFolder(albumId) {
			const parsed = idSchema.safeParse(albumId);
			if (!parsed.success) return false;
			const folder = (await ctx.library.get(parsed.data))?.folder;
			if (!folder || !(await isFolder(folder))) return false;
			return showFolder(folder);
		},

		async albumCover(albumId) {
			const parsed = idSchema.safeParse(albumId);
			if (!parsed.success) return null;
			const cover = await ctx.library.cover(parsed.data).catch(() => null);
			return cover && `data:image/jpeg;base64,${cover.toString("base64")}`;
		},

		async shareAlbum(albumId) {
			const parsed = idSchema.safeParse(albumId);
			const window = ctx.window();
			if (!parsed.success || !window) return null;
			const stored = await ctx.library.get(parsed.data);
			if (!stored) return null;
			const how = await popup<ShareChoice>(window, shareItems);
			return how && share(stored, how);
		},

		async albumMenu(albumId) {
			const parsed = idSchema.safeParse(albumId);
			const window = ctx.window();
			if (!parsed.success || !window) return null;
			const stored = await ctx.library.get(parsed.data);
			if (!stored) return null;
			const saved =
				stored.folder !== undefined && (await isFolder(stored.folder));

			const choice = await popup<AlbumMenuChoice>(window, (pick) => [
				{ label: "Open", click: pick("open") },
				{ label: "Show in Folder", enabled: saved, click: pick("folder") },
				{ label: "Edit and Make Again", click: pick("again") },
				{ label: "Share", submenu: shareItems(pick) },
				{ type: "separator" },
				{ label: "Delete from Library…", click: pick("delete") },
			]);
			if (choice === "file" || choice === "link") return share(stored, choice);

			if (choice === "folder" && stored.folder) {
				await showFolder(stored.folder);
			}
			if (choice === "delete") {
				const { response } = await dialog.showMessageBox(window, {
					type: "warning",
					buttons: ["Cancel", "Delete"],
					defaultId: 0,
					cancelId: 0,
					message: `Delete “${stored.title}” from the library?`,
					detail: "The album's folder and its MP3s stay where they are.",
				});
				if (response !== 1) return null;
			}
			return choice;
		},

		async albums(limit) {
			const parsed = limitSchema.safeParse(limit);
			if (!parsed.success) return [];
			try {
				return await ctx.library.list(parsed.data);
			} catch (error) {
				ctx.log.error({ err: error }, "Reading the album history failed");
				return [];
			}
		},

		async album(id) {
			const parsed = idSchema.safeParse(id);
			if (!parsed.success) return null;
			const stored = await ctx.library.get(parsed.data);
			if (!stored) return null;
			const { folder, hasCover, coverRevision, ...album } = stored;
			return {
				...album,
				hasCover: hasCover === true,
				coverRevision: coverRevision ?? 0,
				folder:
					folder === undefined
						? "never"
						: (await isFolder(folder))
							? "saved"
							: "missing",
			};
		},

		async removeAlbum(id) {
			const parsed = idSchema.safeParse(id);
			return parsed.success ? ctx.library.remove(parsed.data) : false;
		},
	};

	for (const [name, handler] of Object.entries(handlers)) {
		ipcMain.handle(
			CHANNELS[name as keyof typeof CHANNELS],
			(_event, ...args: unknown[]) => handler(...args),
		);
	}
	return { showDestination: handlers.showDestination };
}
