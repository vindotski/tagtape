import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	isJobFinished,
	type JobSnapshot,
	jobProgress,
	SHARE_EXTENSION,
	SHARE_SCHEME,
} from "@tagtape/shared";
import {
	app,
	BrowserWindow,
	dialog,
	Menu,
	Notification,
	nativeTheme,
	screen,
	session,
	shell,
} from "electron";
import { createTagTape, type TagTape } from "../core/index.ts";
import { binaryPaths } from "../core/lib/binaries.ts";
import { pluginPaths } from "../core/plugins/loader.ts";
import { NAVIGATE, type Screen } from "../ipc.ts";
import { registerIpc } from "./ipc.ts";
import { openLibrary } from "./library.ts";
import { installMenu } from "./menu.ts";
import { readShare, shareTargetIn } from "./open-share.ts";
import {
	readWindowState,
	restoreWindowState,
	writeWindowState,
} from "./window-state.ts";

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

const DEFAULT_SIZE = { width: 1080, height: 860 };
const MINIMUM_SIZE = { width: 720, height: 560 };
/** The strip at the top of the page that stands in for the title bar. */
const TITLE_BAR_HEIGHT = 44;

/** The page's own background, so the window never flashes another colour. */
const windowColors = () =>
	nativeTheme.shouldUseDarkColors
		? { background: "#0b0b09", symbols: "#fbfbf9" }
		: { background: "#f5f5f2", symbols: "#0b0b09" };

/**
 * The page draws the top of the window itself. macOS keeps its traffic
 * lights over it and Windows its three buttons; Linux keeps the system's
 * title bar, since window managers differ too much to stand in for.
 */
function titleBar(): Electron.BrowserWindowConstructorOptions {
	const colors = windowColors();
	if (process.platform === "darwin") {
		return {
			titleBarStyle: "hiddenInset",
			trafficLightPosition: { x: 16, y: 15 },
		};
	}
	if (process.platform === "win32") {
		return {
			titleBarStyle: "hidden",
			titleBarOverlay: {
				color: colors.background,
				symbolColor: colors.symbols,
				height: TITLE_BAR_HEIGHT,
			},
		};
	}
	return {};
}

function createWindow(): BrowserWindow {
	const stateFile = join(app.getPath("userData"), "window.json");
	const state = restoreWindowState(
		readWindowState(stateFile),
		screen.getAllDisplays().map((display) => display.workArea),
		DEFAULT_SIZE,
		MINIMUM_SIZE,
	);
	const created = new BrowserWindow({
		width: state.width,
		height: state.height,
		...(state.x !== undefined && state.y !== undefined
			? { x: state.x, y: state.y }
			: {}),
		minWidth: MINIMUM_SIZE.width,
		minHeight: MINIMUM_SIZE.height,
		show: false,
		title: "TagTape",
		backgroundColor: windowColors().background,
		...titleBar(),
		webPreferences: {
			preload: join(here, "../preload/index.cjs"),
			contextIsolation: true,
			sandbox: true,
			nodeIntegration: false,
			webSecurity: true,
			spellcheck: false,
		},
	});
	if (state.maximized) created.maximize();
	created.once("ready-to-show", () => created.show());

	// Light or dark changed while open: the parts the page doesn't draw follow.
	const followTheme = () => {
		const colors = windowColors();
		created.setBackgroundColor(colors.background);
		if (process.platform === "win32") {
			created.setTitleBarOverlay({
				color: colors.background,
				symbolColor: colors.symbols,
			});
		}
	};
	nativeTheme.on("updated", followTheme);

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

	// Right-click: what a text field offers in any desktop app, and Copy for
	// selected text elsewhere. (Albums have their own menu, see ipc.ts.)
	created.webContents.on("context-menu", (_event, params) => {
		const { canCut, canCopy, canPaste, canSelectAll } = params.editFlags;
		if (params.isEditable) {
			Menu.buildFromTemplate([
				{ role: "cut", enabled: canCut },
				{ role: "copy", enabled: canCopy },
				{ role: "paste", enabled: canPaste },
				{ type: "separator" },
				{ role: "selectAll", enabled: canSelectAll },
			]).popup({ window: created });
		} else if (params.selectionText.trim() !== "") {
			Menu.buildFromTemplate([{ role: "copy", enabled: canCopy }]).popup({
				window: created,
			});
		}
	});

	// electron-vite's dev server in development, the built files otherwise.
	const devServer = process.env.ELECTRON_RENDERER_URL;
	if (!app.isPackaged && devServer) void created.loadURL(devServer);
	else void created.loadFile(join(here, "../renderer/index.html"));

	// Closing the window is quitting. While an album is being made, the window
	// stays open until the user has confirmed: "Keep going" must leave them a
	// window to keep going in.
	created.on("close", (event) => {
		writeWindowState(stateFile, {
			...created.getNormalBounds(),
			maximized: created.isMaximized(),
		});
		if (quitting) return;
		event.preventDefault();
		void quitIfConfirmed();
	});
	created.on("closed", () => {
		nativeTheme.off("updated", followTheme);
		if (window === created) window = undefined;
	});
	return created;
}

/** Brings the window forward (making one if it was closed) on `to`. */
function showScreen(to: Screen): void {
	if (!window) {
		if (!tagtape || quitting) return;
		window = createWindow();
	}
	if (window.isMinimized()) window.restore();
	window.show();
	window.focus();
	const page = window.webContents;
	if (page.isLoading())
		page.once("did-finish-load", () => page.send(NAVIGATE, to));
	else page.send(NAVIGATE, to);
}

/** A shared album handed over before the app could show it. */
let shareWaiting: string | undefined;

/**
 * Shows a shared album (the path of a `.tagtape` file, or a `tagtape://`
 * link) in the editor. It is only ever shown: making it is the user's step.
 */
async function openShare(target: string): Promise<void> {
	if (!tagtape) {
		shareWaiting = target;
		return;
	}
	showScreen({ screen: "shared", share: await readShare(target) });
}

/** File > Open Album File… */
async function chooseShare(): Promise<void> {
	const options = {
		title: "Open a shared album",
		properties: ["openFile"] as Array<"openFile">,
		filters: [{ name: "TagTape album", extensions: [SHARE_EXTENSION] }],
	};
	const { canceled, filePaths } = window
		? await dialog.showOpenDialog(window, options)
		: await dialog.showOpenDialog(options);
	const file = filePaths[0];
	if (!canceled && file) await openShare(file);
}

/** The dock or taskbar icon shows how far along the album is. */
function showProgress(job: JobSnapshot): void {
	if (!window) return;
	if (isJobFinished(job.status)) window.setProgressBar(-1);
	else if (job.status === "streaming") {
		// A sliver from the start, so it reads as "working", not "empty".
		window.setProgressBar(Math.max(jobProgress(job) / 100, 0.03));
	} else {
		// Waiting or checking: no amount to show yet.
		window.setProgressBar(2, { mode: "indeterminate" });
	}
}

/**
 * Says an album is done when the user is looking elsewhere. A cancelled album
 * needs no telling. (Shown by the main process: the page has no permissions.)
 */
function notifyFinished(
	job: JobSnapshot,
	album: { title: string; albumId: string | undefined },
): void {
	if (window?.isFocused() || !Notification.isSupported()) return;
	if (job.status === "failed" && job.error === "Cancelled") return;
	const saved = job.status === "done";
	const notification = new Notification({
		title: saved ? "Album saved" : "Album not saved",
		body: saved
			? `“${album.title}” is ready in its folder.`
			: `“${album.title}” didn't work. Open TagTape to see why.`,
	});
	notification.on("click", () => {
		// A saved album opens on its own screen; a failed one is still on
		// the screen that shows what went wrong.
		if (saved && album.albumId) {
			showScreen({ screen: "album", albumId: album.albumId });
		} else if (window) {
			if (window.isMinimized()) window.restore();
			window.show();
			window.focus();
		}
	});
	notification.show();
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
 * removes what it wrote so far), and only then let the app quit. Until then
 * nothing is closed, however often the user asks.
 */
let asking = false;
async function quitIfConfirmed(): Promise<void> {
	if (quitting || asking) return;
	asking = true;
	try {
		if (!(await confirmQuit())) return;
		// Still not "quitting": closing the window again or pressing Cmd+Q
		// while this runs is refused, so cleanup always finishes first.
		await tagtape?.close().catch(() => {});
		quitting = true;
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
	session.defaultSession.setPermissionCheckHandler(() => false);

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

	const ipc = registerIpc({
		tagtape,
		library: openLibrary(join(app.getPath("userData"), "library.json")),
		window: () => window,
		defaultDestination: app.getPath("downloads"),
		log,
		onFinished: notifyFinished,
	});
	tagtape.subscribe(showProgress);
	installMenu({
		navigate: showScreen,
		showSaveFolder: () => void ipc.showDestination(),
		openAlbumFile: () => void chooseShare(),
	});
	// Links to shared albums open this app (the installer registers the
	// file type; in development nothing is registered).
	if (app.isPackaged) app.setAsDefaultProtocolClient(SHARE_SCHEME);

	window = createWindow();

	if (process.env.TAGTAPE_SMOKE_TEST === "1") {
		void smokeTest(tagtape, window);
		return;
	}

	// Started by opening a shared album: macOS said so in an event (held in
	// `shareWaiting`); Windows and Linux put it on the command line.
	const share = shareWaiting ?? shareTargetIn(process.argv.slice(1));
	shareWaiting = undefined;
	if (share) void openShare(share);

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
	// macOS: a double-clicked .tagtape file, or a clicked tagtape:// link.
	// Both can arrive before the app is ready.
	app.on("open-file", (event, path) => {
		event.preventDefault();
		void openShare(path);
	});
	app.on("open-url", (event, url) => {
		event.preventDefault();
		void openShare(url);
	});

	app.on("second-instance", (_event, argv) => {
		// Windows and Linux: the same, as the second start's command line.
		const share = shareTargetIn(argv.slice(1));
		if (share) {
			void openShare(share);
			return;
		}
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
