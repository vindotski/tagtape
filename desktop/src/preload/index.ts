import { contextBridge, ipcRenderer } from "electron";
import { CHANNELS, type TagTapeApi } from "../ipc.ts";

// The only thing the page can reach outside itself: no Node, no Electron
// objects, just these calls. `__APP_VERSION__` is inlined at build time.
const api: TagTapeApi = {
	version: __APP_VERSION__,
	sources: () => ipcRenderer.invoke(CHANNELS.sources),
	startJob: (input) => ipcRenderer.invoke(CHANNELS.startJob, input),
	job: (id) => ipcRenderer.invoke(CHANNELS.job, id),
	cancelJob: (id) => ipcRenderer.invoke(CHANNELS.cancelJob, id),
	destination: () => ipcRenderer.invoke(CHANNELS.destination),
	chooseDestination: () => ipcRenderer.invoke(CHANNELS.chooseDestination),
	showJobFolder: (jobId) => ipcRenderer.invoke(CHANNELS.showJobFolder, jobId),
	showAlbumFolder: (albumId) =>
		ipcRenderer.invoke(CHANNELS.showAlbumFolder, albumId),
	albumCover: (albumId) => ipcRenderer.invoke(CHANNELS.albumCover, albumId),
	albums: (limit) => ipcRenderer.invoke(CHANNELS.albums, limit),
	album: (id) => ipcRenderer.invoke(CHANNELS.album, id),
	removeAlbum: (id) => ipcRenderer.invoke(CHANNELS.removeAlbum, id),
};

contextBridge.exposeInMainWorld("tagtape", api);
