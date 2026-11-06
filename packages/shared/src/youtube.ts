const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set([
	"youtube.com",
	"www.youtube.com",
	"m.youtube.com",
	"music.youtube.com",
]);

/** Paths that carry the video id as their second segment, e.g. `/shorts/<id>`. */
const ID_PATH_PREFIXES = new Set(["shorts", "embed", "live", "v"]);

/**
 * Extracts the 11-character video id from a YouTube URL.
 *
 * Accepts `youtube.com/watch?v=`, `m.` / `music.` / `www.` hosts, `youtu.be/<id>`,
 * and `/shorts/`, `/embed/`, `/live/`, `/v/` paths. A missing scheme is tolerated
 * (people paste `youtube.com/watch?v=…`). Playlist pages and other sites return
 * `null`; a `list=` parameter on a watch URL is ignored.
 */
export function getYouTubeVideoId(input: string): string | null {
	const trimmed = input.trim();
	if (trimmed === "") return null;

	let url: URL;
	try {
		url = new URL(
			/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
		);
	} catch {
		return null;
	}

	if (url.protocol !== "https:" && url.protocol !== "http:") return null;
	if (url.username || url.password || url.port) return null;

	const host = url.hostname.toLowerCase();
	const segments = url.pathname.split("/").filter(Boolean);

	let id: string | null | undefined;
	if (host === "youtu.be" || host === "www.youtu.be") {
		id = segments[0];
	} else if (YOUTUBE_HOSTS.has(host)) {
		if (segments.length === 1 && segments[0] === "watch") {
			id = url.searchParams.get("v");
		} else if (
			segments.length === 2 &&
			ID_PATH_PREFIXES.has(segments[0] ?? "")
		) {
			id = segments[1];
		}
	}

	return id && VIDEO_ID.test(id) ? id : null;
}

/** Canonical watch URL for a video id. */
export function youTubeWatchUrl(videoId: string): string {
	return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Normalises any accepted YouTube URL to `https://www.youtube.com/watch?v=<id>`,
 * or returns `null` when the input isn't a single YouTube video.
 * Only canonical URLs are ever handed to yt-dlp.
 */
export function parseYouTubeUrl(input: string): string | null {
	const id = getYouTubeVideoId(input);
	return id ? youTubeWatchUrl(id) : null;
}
