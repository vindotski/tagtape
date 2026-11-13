import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, session, shell } from "electron";
import { createTagTape, type TagTape } from "../core/index.ts";
import { binaryPaths } from "../core/lib/binaries.ts";
import { pluginPaths } from "../core/plugins/loader.ts";
import { registerIpc } from "./ipc.ts";
import { openLibrary } from "./library.ts";

const here = fileURLToPath(new URL(".", import.meta.url));

const log = {
	info: (obj: object, msg: string) => console.info(msg, obj),
	warn: (obj: object, msg: string) => console.warn(msg, obj),
	error: (obj: object, msg: string) => console.error(msg, obj),
};

let window: BrowserWindow | undefined;
let tagtape: TagTape | undefined;
let quitting = false;

function isExternalLink(url: string): boolean {
	try {
		const { protocol } = new URL(url);
		return protocol === "https:" || protocol === "http:";
	} catch {
		return false;
	}
}

function createWindow(): BrowserWindow {
	const created = new BrowserWindow({
		width: 1080,
		height: 860,
		minWidth: 420,
		minHeight: 560,
		show: false,
		title: "TagTape",
		webPreferences: {
			preload: join(here, "../preload/index.cjs"),
			contextIsolation: true,
			sandbox: true,
			nodeIntegration: false,
			webSecurity: true,
			spellcheck: false,
		},
	});
	created.once("ready-to-show", () => created.show());

	// The window shows the app and nothing else: links open in the browser,
	// and nothing can navigate the window away or open another one.
	created.webContents.setWindowOpenHandler(({ url }) => {
		if (isExternalLink(url)) void shell.openExternal(url);
		return { action: "deny" };
	});
	created.webContents.on("will-navigate", (event, url) => {
		if (url === created.webContents.getURL()) return;
		event.preventDefault();
		if (isExternalLink(url)) void shell.openExternal(url);
	});
	created.webContents.on("will-attach-webview", (event) =>
		event.preventDefault(),
	);

	// electron-vite's dev server in development, the built files otherwise.
	const devServer = process.env.ELECTRON_RENDERER_URL;
	if (!app.isPackaged && devServer) void created.loadURL(devServer);
	else void created.loadFile(join(here, "../renderer/index.html"));

	// Closing the window is quitting. While an album is being made, the window
	// stays open until the user has confirmed: "Keep going" must leave them a
	// window to keep going in.
	created.on("close", (event) => {
		if (quitting) return;
		event.preventDefault();
		void quitIfConfirmed();
	});
	created.on("closed", () => {
		if (window === created) window = undefined;
	});
	return created;
}

/** Closing while an album is being saved would throw it away: ask first. */
async function confirmQuit(): Promise<boolean> {
	if (!tagtape?.busy()) return true;
	const options = {
		type: "question" as const,
		buttons: ["Keep going", "Quit"],
		defaultId: 0,
		cancelId: 0,
		message: "An album is still being made",
		detail: "Quitting now cancels it. Nothing half-finished is left behind.",
	};
	const { response } = window
		? await dialog.showMessageBox(window, options)
		: await dialog.showMessageBox(options);
	return response === 1;
}

/**
 * The one way out: ask if an album is running, then cancel everything (which
 * removes what it wrote so far) and quit. Until then nothing is closed.
 */
let asking = false;
async function quitIfConfirmed(): Promise<void> {
	if (quitting || asking) return;
	asking = true;
	try {
		if (!(await confirmQuit())) return;
		quitting = true;
		await tagtape?.close().catch(() => {});
		app.quit();
	} finally {
		asking = false;
	}
}

async function start(): Promise<void> {
	// No page ever gets a permission (camera, notifications, …). The page's
	// content security policy is a <meta> tag added at build time.
	session.defaultSession.setPermissionRequestHandler((_contents, _name, done) =>
		done(false),
	);

	const bin = binaryPaths(
		app.isPackaged
			? join(process.resourcesPath, "bin")
			: join(app.getAppPath(), "resources", "bin"),
	);
	tagtape = await createTagTape({
		ffmpegBin: bin.ffmpeg,
		ytdlpBin: bin.ytdlp,
		// yt-dlp runs sites' JavaScript challenges with Electron's own binary,
		// started as plain Node.
		jsRuntime: `node:${process.execPath}`,
		jsRuntimeEnv: { ELECTRON_RUN_AS_NODE: "1" },
		plugins: pluginPaths(process.env.TAGTAPE_PLUGINS ?? ""),
		pluginEnv: process.env,
		log,
	});

	registerIpc({
		tagtape,
		library: openLibrary(join(app.getPath("userData"), "library.json")),
		window: () => window,
		defaultDestination: app.getPath("downloads"),
		log,
	});

	window = createWindow();

	if (process.env.TAGTAPE_SMOKE_TEST === "1") {
		void smokeTest(tagtape, window);
		return;
	}

	// The bundled programs must run, or nothing will work: say so at once.
	tagtape.versions().then(
		(versions) => log.info(versions, "Bundled programs"),
		(error: unknown) => {
			log.error({ err: error }, "A bundled program doesn't run");
			dialog.showErrorBox(
				"TagTape can't start its tools",
				"ffmpeg or yt-dlp didn't run. Reinstalling TagTape should fix this.",
			);
		},
	);
}

/**
 * For CI, on a packaged build: the page loads and renders, and the bundled
 * programs run. Prints the result and exits with 0 or 1.
 */
async function smokeTest(core: TagTape, page: BrowserWindow): Promise<void> {
	const timeout = setTimeout(() => {
		console.error("SMOKE FAILED: timed out");
		app.exit(1);
	}, 60_000);
	try {
		const versions = await core.versions();
		if (page.webContents.isLoading()) {
			await new Promise<void>((resolve) => {
				page.webContents.once("did-finish-load", () => resolve());
			});
		}
		const text: unknown = await page.webContents.executeJavaScript(
			"new Promise((done) => setTimeout(() => done(document.body.innerText), 1500))",
		);
		if (typeof text !== "string" || !text.includes("Make album")) {
			throw new Error("the album form didn't render");
		}
		console.log(`SMOKE OK ${JSON.stringify(versions)}`);
		clearTimeout(timeout);
		await core.close();
		app.exit(0);
	} catch (error) {
		console.error("SMOKE FAILED:", error);
		app.exit(1);
	}
}

if (!app.requestSingleInstanceLock()) {
	app.quit();
} else {
	app.on("second-instance", () => {
		// Never leave a running app without a window to reach it by.
		if (!window) {
			if (app.isReady() && tagtape && !quitting) window = createWindow();
			return;
		}
		if (window.isMinimized()) window.restore();
		window.focus();
	});

	app.on("window-all-closed", () => app.quit());

	// Cmd+Q, the dock or the system shutting down: the same question.
	app.on("before-quit", (event) => {
		if (quitting) return;
		event.preventDefault();
		void quitIfConfirmed();
	});

	void app.whenReady().then(start, (error: unknown) => {
		console.error(error);
		app.exit(1);
	});
}
