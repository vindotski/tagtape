// The one script on this website. It reads a shared album out of the page's
// own address (the part after `#`, which browsers never send to a server),
// shows what is in it, and offers to hand it to the app. It makes no
// requests, and everything it shows is set as text, never as HTML.
import {
	type Album,
	albumFolderName,
	albumFromFragment,
	appLink,
	encodeShare,
	SHARE_EXTENSION,
} from "@tagtape/shared";

function element<T extends HTMLElement>(id: string): T {
	const found = document.getElementById(id);
	if (!found) throw new Error(`The page has no #${id}`);
	return found as T;
}

const intro = element("share-intro");
const problem = element("share-problem");
const shown = element("share-album");
let fileUrl: string | undefined;

function show(album: Album, fragment: string): void {
	element("share-title").textContent = album.title;
	element("share-artist").textContent = album.artist;
	const count = `${album.tracks.length} ${album.tracks.length === 1 ? "track" : "tracks"}`;
	element("share-details").textContent = [album.genre, album.year, count]
		.filter(Boolean)
		.join(" · ");

	const list = element("share-tracks");
	list.replaceChildren(
		...album.tracks.map((track) => {
			const item = document.createElement("li");
			item.className = "flex flex-wrap items-baseline gap-x-4 px-4 py-2.5";
			const title = document.createElement("span");
			title.className = "min-w-0 flex-1 font-medium";
			title.textContent = track.title;
			// Where the link points, so it can be judged before anything opens it.
			const host = document.createElement("span");
			host.className = "text-sm text-muted-foreground";
			host.textContent = new URL(track.url).hostname;
			item.append(title, host);
			return item;
		}),
	);

	// A very large album makes a link too long to start the app with (see
	// `appLink`): then the file is the way in.
	const link = appLink(fragment);
	const open = element<HTMLAnchorElement>("share-open");
	open.hidden = link === null;
	if (link) open.href = link;
	element("share-too-long").hidden = link !== null;

	// The same album as a file, made here in the browser.
	if (fileUrl) URL.revokeObjectURL(fileUrl);
	fileUrl = URL.createObjectURL(
		new Blob([encodeShare(album)], { type: "application/json" }),
	);
	const save = element<HTMLAnchorElement>("share-save");
	save.href = fileUrl;
	save.download = `${albumFolderName(album.artist, album.title)}.${SHARE_EXTENSION}`;

	document.title = `${album.title} · TagTape`;
}

function read(): void {
	const fragment = location.hash;
	const result = fragment.length > 1 ? albumFromFragment(fragment) : null;
	intro.hidden = result !== null;
	shown.hidden = !result?.ok;
	problem.hidden = result === null || result.ok;
	if (result?.ok) show(result.album, fragment);
	else if (result) element("share-problem-text").textContent = result.message;
}

read();
addEventListener("hashchange", read);
