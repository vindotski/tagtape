import { contextBridge, ipcRenderer } from "electron";
import { CHANNELS, NAVIGATE, type Screen, type TagTapeApi } from "../ipc.ts";

// Main may ask for a screen before the page has started listening (a shared
// album opened while the app starts): keep those until it does.
const waiting: Screen[] = [];
let navigate: ((to: Screen) => void) | undefined;
ipcRenderer.on(NAVIGATE, (_event, to: Screen) => {
	if (navigate) navigate(to);
	else waiting.push(to);
});

// The only thing the page can reach outside itself: no Node, no Electron
// objects, just these calls. `__APP_VERSION__` is inlined at build time.
const api: TagTapeApi = {
	version: __APP_VERSION__,
	platform: process.platform,
	onNavigate(listener) {
		navigate = listener;
		for (const to of waiting.splice(0)) listener(to);
		return () => {
			if (navigate === listener) navigate = undefined;
		};
	},
	sources: () => ipcRenderer.invoke(CHANNELS.sources),
	startJob: (input) => ipcRenderer.invoke(CHANNELS.startJob, input),
	job: (id) => ipcRenderer.invoke(CHANNELS.job, id),
	cancelJob: (id) => ipcRenderer.invoke(CHANNELS.cancelJob, id),
	destination: () => ipcRenderer.invoke(CHANNELS.destination),
	chooseDestination: () => ipcRenderer.invoke(CHANNELS.chooseDestination),
	showDestination: () => ipcRenderer.invoke(CHANNELS.showDestination),
	versions: () => ipcRenderer.invoke(CHANNELS.versions),
	clearAlbums: () => ipcRenderer.invoke(CHANNELS.clearAlbums),
	showJobFolder: (jobId) => ipcRenderer.invoke(CHANNELS.showJobFolder, jobId),
	showAlbumFolder: (albumId) =>
		ipcRenderer.invoke(CHANNELS.showAlbumFolder, albumId),
	albumCover: (albumId) => ipcRenderer.invoke(CHANNELS.albumCover, albumId),
	shareAlbum: (albumId) => ipcRenderer.invoke(CHANNELS.shareAlbum, albumId),
	albumMenu: (albumId) => ipcRenderer.invoke(CHANNELS.albumMenu, albumId),
	albums: (limit) => ipcRenderer.invoke(CHANNELS.albums, limit),
	album: (id) => ipcRenderer.invoke(CHANNELS.album, id),
	removeAlbum: (id) => ipcRenderer.invoke(CHANNELS.removeAlbum, id),
};

contextBridge.exposeInMainWorld("tagtape", api);
