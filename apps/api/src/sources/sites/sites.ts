import { parseWebUrl, pathSegments } from "./web-url.ts";
import { getYouTubeVideoId, youTubeWatchUrl } from "./youtube.ts";

/**
 * The only sites TagTape fetches from. Two independent gates enforce this:
 * `parseTrackUrl` below (only canonical single-track URLs pass), and yt-dlp's
 * `--use-extractors` with the `extractor` names here (yt-dlp itself refuses
 * every other extractor, including the generic one that fetches any web page).
 * Keep both in sync when adding a site.
 */
export const SUPPORTED_SITES = [
	{ id: "youtube", name: "YouTube", extractor: "youtube" },
	{ id: "soundcloud", name: "SoundCloud", extractor: "soundcloud" },
	{ id: "bandcamp", name: "Bandcamp", extractor: "Bandcamp" },
	{ id: "mixcloud", name: "Mixcloud", extractor: "mixcloud" },
	{ id: "vimeo", name: "Vimeo", extractor: "vimeo" },
] as const;

export type SiteId = (typeof SUPPORTED_SITES)[number]["id"];

/** Value for yt-dlp's `--use-extractors`: exact extractor names, comma-separated. */
export const YTDLP_EXTRACTORS = SUPPORTED_SITES.map(
	(site) => site.extractor,
).join(",");

/** "YouTube, SoundCloud, Bandcamp, Mixcloud or Vimeo" */
export const SUPPORTED_SITE_NAMES = (() => {
	const names = SUPPORTED_SITES.map((site) => site.name);
	return `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;
})();

export interface TrackSource {
	site: SiteId;
	/** Canonical URL; the only form ever handed to yt-dlp. */
	url: string;
}

const SLUG = /^[A-Za-z0-9_-]+$/;

// --- SoundCloud: soundcloud.com/<user>/<track>[/s-<secret>]
const SOUNDCLOUD_HOSTS = new Set([
	"soundcloud.com",
	"www.soundcloud.com",
	"m.soundcloud.com",
]);
/** First path segments that are site pages, not artists. */
const SOUNDCLOUD_PAGES = new Set([
	"discover",
	"stream",
	"search",
	"you",
	"upload",
	"charts",
	"pages",
	"settings",
	"messages",
	"notifications",
	"people",
	"tags",
	"stations",
	"mobile",
	"jobs",
	"imprint",
	"terms-of-use",
	"pro",
	"feed",
	"trending",
	"artist",
]);
/** Second path segments that are lists on an artist's page, not tracks. */
const SOUNDCLOUD_LISTS = new Set([
	"sets",
	"albums",
	"tracks",
	"likes",
	"reposts",
	"popular-tracks",
	"followers",
	"following",
	"comments",
	"spotlight",
	"toptracks",
	"playlists",
]);

function soundcloud(url: URL): string | null {
	if (!SOUNDCLOUD_HOSTS.has(url.hostname.toLowerCase())) return null;
	const [user, track, secret, ...rest] = pathSegments(url);
	if (!user || !track || rest.length > 0) return null;
	if (!SLUG.test(user) || !SLUG.test(track)) return null;
	if (
		SOUNDCLOUD_PAGES.has(user.toLowerCase()) ||
		SOUNDCLOUD_LISTS.has(track.toLowerCase())
	) {
		return null;
	}
	if (secret !== undefined && !/^s-[A-Za-z0-9]+$/.test(secret)) return null;
	return `https://soundcloud.com/${user}/${track}${secret ? `/${secret}` : ""}`;
}

// --- Bandcamp: <artist>.bandcamp.com/track/<slug>
const BANDCAMP_HOST = /^([a-z0-9][a-z0-9-]*)\.bandcamp\.com$/;
const BANDCAMP_NOT_ARTISTS = new Set([
	"www",
	"daily",
	"blog",
	"get",
	"f4",
	"s4",
]);

function bandcamp(url: URL): string | null {
	const artist = url.hostname.toLowerCase().match(BANDCAMP_HOST)?.[1];
	if (!artist || BANDCAMP_NOT_ARTISTS.has(artist)) return null;
	const segments = pathSegments(url);
	const slug = segments[1];
	if (
		segments.length !== 2 ||
		segments[0] !== "track" ||
		!slug ||
		!SLUG.test(slug)
	) {
		return null;
	}
	return `https://${artist}.bandcamp.com/track/${slug}`;
}

// --- Mixcloud: mixcloud.com/<user>/<show>/
const MIXCLOUD_HOSTS = new Set([
	"mixcloud.com",
	"www.mixcloud.com",
	"m.mixcloud.com",
]);
const MIXCLOUD_PAGES = new Set([
	"discover",
	"upload",
	"search",
	"select",
	"live",
	"categories",
	"tag",
	"settings",
	"dashboard",
	"about",
	"developers",
	"pro",
	"notifications",
	"messages",
	"creators",
]);
const MIXCLOUD_LISTS = new Set([
	"uploads",
	"favorites",
	"listens",
	"playlists",
	"stream",
	"reposts",
	"followers",
	"following",
	"hosts",
	"history",
]);
/** Mixcloud slugs may contain percent-encoded characters. */
const MIXCLOUD_SLUG = /^[A-Za-z0-9_.%-]+$/;

function mixcloud(url: URL): string | null {
	if (!MIXCLOUD_HOSTS.has(url.hostname.toLowerCase())) return null;
	const segments = pathSegments(url);
	const [user, show] = segments;
	if (segments.length !== 2 || !user || !show) return null;
	if (!MIXCLOUD_SLUG.test(user) || !MIXCLOUD_SLUG.test(show)) return null;
	if (
		MIXCLOUD_PAGES.has(user.toLowerCase()) ||
		MIXCLOUD_LISTS.has(show.toLowerCase())
	) {
		return null;
	}
	return `https://www.mixcloud.com/${user}/${show}/`;
}

// --- Vimeo: vimeo.com/<id>[/<hash>], player.vimeo.com/video/<id>[?h=<hash>]
//     → https://player.vimeo.com/video/<id>[?h=<hash>]
const VIMEO_ID = /^\d{1,12}$/;
const VIMEO_HASH = /^[0-9a-f]{6,20}$/;

function vimeo(url: URL): string | null {
	const host = url.hostname.toLowerCase();
	const segments = pathSegments(url);
	let id: string | undefined;
	let hash: string | undefined;
	if (host === "vimeo.com" || host === "www.vimeo.com") {
		if (segments.length < 1 || segments.length > 2) return null;
		[id, hash] = segments;
	} else if (host === "player.vimeo.com") {
		if (segments.length !== 2 || segments[0] !== "video") return null;
		id = segments[1];
		hash = url.searchParams.get("h") ?? undefined;
	} else {
		return null;
	}
	if (!id || !VIMEO_ID.test(id)) return null;
	if (hash !== undefined && !VIMEO_HASH.test(hash)) return null;
	// Canonical form is the player URL: yt-dlp's vimeo.com web client now demands
	// a login ("The web client only works when logged-in"), the player doesn't.
	return `https://player.vimeo.com/video/${id}${hash ? `?h=${hash}` : ""}`;
}

function youtube(url: URL): string | null {
	const id = getYouTubeVideoId(url.href);
	return id ? youTubeWatchUrl(id) : null;
}

const PARSERS: Record<SiteId, (url: URL) => string | null> = {
	youtube,
	soundcloud,
	bandcamp,
	mixcloud,
	vimeo,
};

/**
 * Turns a pasted link into a canonical single-track URL on a supported site,
 * or `null`. Playlists, sets, albums, channels, profiles, short links and every
 * other site are rejected.
 */
export function parseTrackUrl(input: string): TrackSource | null {
	const url = parseWebUrl(input);
	if (!url) return null;
	for (const { id } of SUPPORTED_SITES) {
		const canonical = PARSERS[id](url);
		if (canonical) return { site: id, url: canonical };
	}
	return null;
}
