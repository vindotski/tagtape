import { stat } from "node:fs/promises";
import { type BrowserWindow, dialog, ipcMain, shell } from "electron";
import { z } from "zod";
import type { TagTape } from "../core/index.ts";
import {
	CHANNELS,
	type FieldErrors,
	type StartJobResult,
	type TagTapeApi,
} from "../ipc.ts";
import type { AlbumHistory } from "./history.ts";

const idSchema = z.uuid();
const startSchema = z.object({
	album: z.unknown(),
	albumId: z.uuid().optional(),
});
const limitSchema = z.int().min(1).max(100);

export interface IpcContext {
	tagtape: TagTape;
	history: AlbumHistory;
	window: () => BrowserWindow | undefined;
	/** The folder albums are saved in, and how it's changed. */
	destination: () => string;
	setDestination: (folder: string) => void;
	log: { error(obj: object, msg: string): void };
}

type Handlers = {
	[K in keyof Omit<TagTapeApi, "version">]: (
		...args: unknown[]
	) => ReturnType<TagTapeApi[K]>;
};

/**
 * Registers one handler per channel. Every argument arrives as `unknown` and
 * is validated here: the page is never trusted to send the right shape.
 */
export function registerIpc(ctx: IpcContext): void {
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
				ctx.destination(),
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
			// History is a convenience: the album still starts if this fails.
			let albumId: string | undefined;
			try {
				albumId = await ctx.history.record(outcome.album, parsed.data.albumId);
			} catch (error) {
				ctx.log.error({ err: error }, "Recording the album failed");
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

		destination: async () => ctx.destination(),

		async chooseDestination() {
			const window = ctx.window();
			const options = {
				title: "Where should albums be saved?",
				defaultPath: ctx.destination(),
				properties: ["openDirectory", "createDirectory"] as Array<
					"openDirectory" | "createDirectory"
				>,
			};
			const result = window
				? await dialog.showOpenDialog(window, options)
				: await dialog.showOpenDialog(options);
			const folder = result.filePaths[0];
			if (!result.canceled && folder) ctx.setDestination(folder);
			return ctx.destination();
		},

		// By job id, never by path: the page can't make the app open arbitrary files.
		async showJobFolder(jobId) {
			const parsed = idSchema.safeParse(jobId);
			const folder = parsed.success
				? ctx.tagtape.getJob(parsed.data)?.folder
				: undefined;
			if (!folder) return false;
			const exists = await stat(folder).then(
				(info) => info.isDirectory(),
				() => false,
			);
			if (!exists) return false;
			return (await shell.openPath(folder)) === "";
		},

		async albums(limit) {
			const parsed = limitSchema.safeParse(limit);
			if (!parsed.success) return [];
			try {
				return await ctx.history.list(parsed.data);
			} catch (error) {
				ctx.log.error({ err: error }, "Reading the album history failed");
				return [];
			}
		},

		async album(id) {
			const parsed = idSchema.safeParse(id);
			return parsed.success ? ctx.history.get(parsed.data) : null;
		},

		async removeAlbum(id) {
			const parsed = idSchema.safeParse(id);
			return parsed.success ? ctx.history.remove(parsed.data) : false;
		},
	};

	for (const [name, handler] of Object.entries(handlers)) {
		ipcMain.handle(
			CHANNELS[name as keyof typeof CHANNELS],
			(_event, ...args: unknown[]) => handler(...args),
		);
	}
}
