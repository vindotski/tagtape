import { app, Menu, type MenuItemConstructorOptions, shell } from "electron";
import type { Screen } from "../ipc.ts";
import { LINKS } from "./links.ts";

export interface MenuActions {
	/** Shows a screen in the window (bringing the window forward). */
	navigate(to: Screen): void;
	/** Opens the folder albums are saved in. */
	showSaveFolder(): void;
	/** Asks for a shared album file (`.tagtape`) and opens it. */
	openAlbumFile(): void;
}

/**
 * The application menu: what a desktop app is expected to have, with the
 * usual shortcuts. Quit is the standard item, so it goes through the same
 * question as closing the window (see `before-quit` in index.ts).
 */
export function installMenu(actions: MenuActions): void {
	const mac = process.platform === "darwin";
	const settings: MenuItemConstructorOptions = {
		label: "Settings…",
		accelerator: "CmdOrCtrl+,",
		click: () => actions.navigate({ screen: "settings" }),
	};
	const template: MenuItemConstructorOptions[] = [
		...(mac
			? [
					{
						label: app.name,
						submenu: [
							{ role: "about" },
							{ type: "separator" },
							settings,
							{ type: "separator" },
							{ role: "services" },
							{ type: "separator" },
							{ role: "hide" },
							{ role: "hideOthers" },
							{ role: "unhide" },
							{ type: "separator" },
							{ role: "quit" },
						],
					} satisfies MenuItemConstructorOptions,
				]
			: []),
		{
			label: "File",
			submenu: [
				{
					label: "New Album",
					accelerator: "CmdOrCtrl+N",
					click: () => actions.navigate({ screen: "new" }),
				},
				{
					label: "Open Album File…",
					accelerator: "CmdOrCtrl+O",
					click: () => actions.openAlbumFile(),
				},
				{ type: "separator" },
				{ label: "Open Save Folder", click: () => actions.showSaveFolder() },
				...(mac
					? []
					: ([
							{ type: "separator" },
							settings,
							{ type: "separator" },
							{ role: "quit" },
						] satisfies MenuItemConstructorOptions[])),
			],
		},
		{ role: "editMenu" },
		{
			label: "View",
			submenu: [
				{
					label: "New Album",
					accelerator: "CmdOrCtrl+1",
					click: () => actions.navigate({ screen: "new" }),
				},
				{
					label: "Library",
					accelerator: "CmdOrCtrl+2",
					click: () => actions.navigate({ screen: "library" }),
				},
				{ type: "separator" },
				{ role: "togglefullscreen" },
				// Only while developing: the packaged app is not a browser.
				...(app.isPackaged
					? []
					: ([
							{ type: "separator" },
							{ role: "reload" },
							{ role: "toggleDevTools" },
						] satisfies MenuItemConstructorOptions[])),
			],
		},
		{ role: "windowMenu" },
		{
			role: "help",
			submenu: [
				{
					label: "TagTape Website",
					click: () => void shell.openExternal(LINKS.website),
				},
				{
					label: "What's New",
					click: () => void shell.openExternal(LINKS.changelog),
				},
				{
					label: "Source Code",
					click: () => void shell.openExternal(LINKS.source),
				},
			],
		},
	];
	Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
