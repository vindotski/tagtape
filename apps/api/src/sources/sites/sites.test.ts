import { describe, expect, test } from "vitest";
import {
	parseTrackUrl,
	SUPPORTED_SITE_NAMES,
	SUPPORTED_SITES,
	YTDLP_EXTRACTORS,
} from "./sites.ts";

describe("parseTrackUrl accepts single tracks", () => {
	test.each([
		// YouTube (incl. Music), canonicalised as before
		[
			"https://youtu.be/dQw4w9WgXcQ",
			"youtube",
			"https://www.youtube.com/watch?v=dQw4w9WgXcQ",
		],
		[
			"music.youtube.com/watch?v=dQw4w9WgXcQ&si=x",
			"youtube",
			"https://www.youtube.com/watch?v=dQw4w9WgXcQ",
		],
		// SoundCloud
		[
			"https://soundcloud.com/forss/flickermood",
			"soundcloud",
			"https://soundcloud.com/forss/flickermood",
		],
		[
			"https://m.soundcloud.com/forss/flickermood?in=foo/sets/bar&utm_source=x",
			"soundcloud",
			"https://soundcloud.com/forss/flickermood",
		],
		[
			"soundcloud.com/artist_1/track-2/s-AbC123",
			"soundcloud",
			"https://soundcloud.com/artist_1/track-2/s-AbC123",
		],
		// Bandcamp
		[
			"https://kiliiii.bandcamp.com/track/frostbite",
			"bandcamp",
			"https://kiliiii.bandcamp.com/track/frostbite",
		],
		[
			"http://Artist-Name.Bandcamp.com/track/Song_1?from=embed",
			"bandcamp",
			"https://artist-name.bandcamp.com/track/Song_1",
		],
		// Mixcloud
		[
			"https://www.mixcloud.com/spartacus/party-time/",
			"mixcloud",
			"https://www.mixcloud.com/spartacus/party-time/",
		],
		[
			"mixcloud.com/some_dj/live-at-club-2024",
			"mixcloud",
			"https://www.mixcloud.com/some_dj/live-at-club-2024/",
		],
		[
			"https://www.mixcloud.com/dj/caf%C3%A9-mix/",
			"mixcloud",
			"https://www.mixcloud.com/dj/caf%C3%A9-mix/",
		],
		// Vimeo
		// Vimeo is canonicalised to the player URL (vimeo.com pages need a login in yt-dlp)
		[
			"https://vimeo.com/76979871",
			"vimeo",
			"https://player.vimeo.com/video/76979871",
		],
		[
			"vimeo.com/76979871/a1b2c3d4e5",
			"vimeo",
			"https://player.vimeo.com/video/76979871?h=a1b2c3d4e5",
		],
		[
			"https://player.vimeo.com/video/76979871?h=a1b2c3d4e5&badge=0",
			"vimeo",
			"https://player.vimeo.com/video/76979871?h=a1b2c3d4e5",
		],
	])("%s", (input, site, url) => {
		expect(parseTrackUrl(input)).toEqual({ site, url });
	});
});

describe("parseTrackUrl rejects everything else", () => {
	test.each([
		// Collections: one track per row, always
		["YouTube playlist", "https://www.youtube.com/playlist?list=PL123"],
		["SoundCloud set", "https://soundcloud.com/forss/sets/soulhack"],
		["SoundCloud artist page", "https://soundcloud.com/forss"],
		["SoundCloud artist tracks", "https://soundcloud.com/forss/tracks"],
		["SoundCloud likes", "https://soundcloud.com/forss/likes"],
		["SoundCloud discover", "https://soundcloud.com/discover/sets"],
		["SoundCloud bad secret", "https://soundcloud.com/a/b/not-a-secret"],
		["SoundCloud short link", "https://on.soundcloud.com/AbCdEf"],
		["Bandcamp album", "https://kiliiii.bandcamp.com/album/frostbite"],
		["Bandcamp artist", "https://kiliiii.bandcamp.com/"],
		["Bandcamp root", "https://bandcamp.com/track/frostbite"],
		["Bandcamp daily", "https://daily.bandcamp.com/track/foo"],
		["Bandcamp custom domain", "https://music.someartist.com/track/foo"],
		["Mixcloud profile", "https://www.mixcloud.com/spartacus/"],
		["Mixcloud uploads", "https://www.mixcloud.com/spartacus/uploads/"],
		["Mixcloud playlist", "https://www.mixcloud.com/spartacus/playlists/mix/"],
		["Mixcloud discover", "https://www.mixcloud.com/discover/house/"],
		["Vimeo channel", "https://vimeo.com/channels/staffpicks/76979871"],
		["Vimeo album", "https://vimeo.com/album/123"],
		["Vimeo user", "https://vimeo.com/someuser"],
		["Vimeo bad hash", "https://vimeo.com/76979871/NOT-HEX"],
		// Other sites and lookalikes
		["Spotify", "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC"],
		["lookalike SoundCloud", "https://soundcloud.com.evil.example/a/b"],
		["lookalike Bandcamp", "https://artist.bandcamp.com.evil.example/track/a"],
		["lookalike Vimeo", "https://vimeo.com.evil.example/76979871"],
		["generic page", "https://example.com/song.mp3"],
		["metadata IP", "http://169.254.169.254/latest/meta-data/"],
		// Unsafe forms
		["credentials", "https://user:pass@soundcloud.com/a/b"],
		["custom port", "https://vimeo.com:8443/76979871"],
		["ftp", "ftp://kiliiii.bandcamp.com/track/frostbite"],
		["option injection", "--exec=touch /tmp/pwned"],
		["empty", "   "],
	])("%s", (_label, input) => {
		expect(parseTrackUrl(input)).toBeNull();
	});
});

describe("supported sites", () => {
	test("yt-dlp allow-list has one exact extractor per site", () => {
		expect(YTDLP_EXTRACTORS).toBe("youtube,soundcloud,Bandcamp,mixcloud,vimeo");
		expect(SUPPORTED_SITES).toHaveLength(5);
	});

	test("human-readable list", () => {
		expect(SUPPORTED_SITE_NAMES).toBe(
			"YouTube, SoundCloud, Bandcamp, Mixcloud or Vimeo",
		);
	});
});
