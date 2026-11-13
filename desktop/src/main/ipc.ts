import { stat } from "node:fs/promises";
import { isJobFinished, type JobSnapshot } from "@tagtape/shared";
import { type BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import { z } from "zod";
import type { TagTape } from "../core/index.ts";
import { thumbnail } from "../core/pipeline/cover.ts";
import {
	type AlbumMenuChoice,
	CHANNELS,
	type FieldErrors,
	type StartJobResult,
	type TagTapeApi,
} from "../ipc.ts";
import type { Library } from "./library.ts";

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
	[K in keyof Omit<TagTapeApi, "version" | "platform" | "onNavigate">]: (
		...args: unknown[]
	) => ReturnType<TagTapeApi[K]>;
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

	/** The remembered folder, if it still exists; otherwise the default. */
	async function destination(): Promise<string> {
		const remembered = await ctx.library.destination().catch(() => undefined);
		if (remembered && (await isFolder(remembered))) return remembered;
		return ctx.defaultDestination;
	}

	// A finished album's folder and cover go into the library. The job and the
	// library entry are made a moment apart, so either may come first.
	type Finished = { folder: string; cover: Uint8Array | undefined };
	const albumOfJob = new Map<string, string>();
	const titleOfJob = new Map<string, string>();
	const finishedEarly = new Map<string, Finished>();
	async function remember(albumId: string, result: Finished): Promise<void> {
		try {
			await ctx.library.finished(albumId, {
				folder: result.folder,
				cover: result.cover && (await thumbnail(result.cover)),
			});
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
		if (albumId) void remember(albumId, result);
		else finishedEarly.set(job.id, result);
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
			// History is a convenience: the album still starts if this fails.
			let albumId: string | undefined;
			try {
				albumId = await ctx.library.record(outcome.album, parsed.data.albumId);
			} catch (error) {
				ctx.log.error({ err: error }, "Recording the album failed");
			}
			const early = finishedEarly.get(outcome.jobId);
			finishedEarly.delete(outcome.jobId);
			if (albumId) {
				const status = ctx.tagtape.getJob(outcome.jobId)?.status;
				if (early) void remember(albumId, early);
				else if (status && !isJobFinished(status)) {
					albumOfJob.set(outcome.jobId, albumId);
				}
			}
			return albumId
				? { ok: true, jobId: outcome.jobId, albumId }
				: { ok: true, jobId: outcome.jobId };
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
				await ctx.library.setDestination(folder).catch((error: unknown) => {
					ctx.log.error({ err: error }, "Remembering the folder failed");
				});
				return folder;
			}
			return destination();
		},

		async showDestination() {
			return (await shell.openPath(await destination())) === "";
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
			return (await shell.openPath(folder)) === "";
		},

		// By album id, for the same reason.
		async showAlbumFolder(albumId) {
			const parsed = idSchema.safeParse(albumId);
			if (!parsed.success) return false;
			const folder = (await ctx.library.get(parsed.data))?.folder;
			if (!folder || !(await isFolder(folder))) return false;
			return (await shell.openPath(folder)) === "";
		},

		async albumCover(albumId) {
			const parsed = idSchema.safeParse(albumId);
			if (!parsed.success) return null;
			const cover = await ctx.library.cover(parsed.data).catch(() => null);
			return cover && `data:image/jpeg;base64,${cover.toString("base64")}`;
		},

		async albumMenu(albumId) {
			const parsed = idSchema.safeParse(albumId);
			const window = ctx.window();
			if (!parsed.success || !window) return null;
			const stored = await ctx.library.get(parsed.data);
			if (!stored) return null;
			const saved =
				stored.folder !== undefined && (await isFolder(stored.folder));

			const choice = await new Promise<AlbumMenuChoice | null>((resolve) => {
				// A click resolves at once. Closing the menu resolves to nothing, a
				// moment later: on some systems "closed" arrives before the click.
				const pick = (value: AlbumMenuChoice) => () => resolve(value);
				Menu.buildFromTemplate([
					{ label: "Open", click: pick("open") },
					{ label: "Show in Folder", enabled: saved, click: pick("folder") },
					{ label: "Edit and Make Again", click: pick("again") },
					{ type: "separator" },
					{ label: "Delete from Library…", click: pick("delete") },
				]).popup({
					window,
					callback: () => setTimeout(() => resolve(null), 200),
				});
			});

			if (choice === "folder" && stored.folder) {
				await shell.openPath(stored.folder);
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
			const { folder, hasCover, ...album } = stored;
			return {
				...album,
				hasCover: hasCover === true,
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
