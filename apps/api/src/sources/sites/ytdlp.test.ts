import { describe, expect, test } from "vitest";
import {
	describeYtDlpFailure,
	ffmpegArgs,
	parseProbe,
	probeArgs,
	streamArgs,
} from "./ytdlp.ts";

const ytOptions = {
	bin: "yt-dlp",
	ffmpegBin: "/usr/bin/ffmpeg",
	jsRuntime: "node",
	timeoutMs: 1000,
};

describe("yt-dlp arguments", () => {
	test("probe ends options before the URL and ignores config files", () => {
		const args = probeArgs(
			"https://www.youtube.com/watch?v=dQw4w9WgXcQ",
			ytOptions,
		);
		expect(args).toContain("--ignore-config");
		expect(args).toContain("--no-playlist");
		expect(args.slice(-2)).toEqual([
			"--",
			"https://www.youtube.com/watch?v=dQw4w9WgXcQ",
		]);
		expect(args).toEqual(expect.arrayContaining(["--js-runtimes", "node"]));
	});

	test("every call is restricted to the supported sites' extractors", () => {
		for (const args of [
			probeArgs("https://soundcloud.com/a/b", ytOptions),
			streamArgs(ytOptions),
		]) {
			expect(args[args.indexOf("--use-extractors") + 1]).toBe(
				"youtube,soundcloud,Bandcamp,mixcloud,vimeo",
			);
		}
	});

	test("probe picks the same audio format the stream will use", () => {
		const args = probeArgs("https://soundcloud.com/a/b", ytOptions);
		expect(args[args.indexOf("-f") + 1]).toBe(
			"bestaudio[protocol!*=dash]/best[protocol!*=dash]",
		);
	});

	test("stream reads the probe from stdin and writes audio to stdout (no disk)", () => {
		const args = streamArgs(ytOptions);
		const after = (flag: string) => args[args.indexOf(flag) + 1];
		expect(after("--load-info-json")).toBe("-");
		expect(after("--output")).toBe("-");
		expect(after("-f")).toBe(
			"bestaudio[protocol!*=dash]/best[protocol!*=dash]",
		);
		// yt-dlp's native HLS-to-stdout crashes; ffmpeg handles HLS.
		expect(after("--downloader")).toBe("m3u8:ffmpeg");
		expect(after("--ffmpeg-location")).toBe("/usr/bin/ffmpeg");
	});

	test("ffmpeg writes untagged CBR MP3 to stdout, copying MP3 sources", () => {
		const encode = ffmpegArgs("opus");
		const after = (args: string[], flag: string) =>
			args[args.indexOf(flag) + 1];
		expect(after(encode, "-c:a")).toBe("libmp3lame");
		expect(after(encode, "-b:a")).toBe("256k");
		expect(after(encode, "-id3v2_version")).toBe("0");
		expect(after(encode, "-write_id3v1")).toBe("0");
		expect(after(encode, "-write_xing")).toBe("0");
		expect(after(encode, "-i")).toBe("pipe:0");
		expect(encode.at(-1)).toBe("pipe:1");

		const copy = ffmpegArgs("mp3");
		expect(after(copy, "-c:a")).toBe("copy");
		expect(copy).not.toContain("-b:a");
	});

	test("js runtime flag can be disabled", () => {
		expect(probeArgs("u", { ...ytOptions, jsRuntime: "" })).not.toContain(
			"--js-runtimes",
		);
	});

	test.each([
		[
			"ERROR: [youtube] abc: Private video. Sign in if you've been granted access",
			"This track is private",
		],
		["ERROR: [youtube] abc: Video unavailable", "This track is unavailable"],
		// Real yt-dlp 2026.10.26 wording, seen in the e2e run:
		[
			"ERROR: [youtube] BaW_jenozKc: This video is unavailable",
			"This track is unavailable",
		],
		[
			"ERROR: [youtube] abc: This video is no longer available",
			"This track is unavailable",
		],
		[
			"WARNING: x\nERROR: [youtube] abc: Sign in to confirm your age",
			"This track is age-restricted",
		],
		[
			"ERROR: [youtube] jfKfPfyJRdk: This live stream recording is not available.",
			"This live stream's recording isn't available",
		],
		[
			"ERROR: [soundcloud] 123: Unable to download JSON metadata: HTTP Error 404: Not Found",
			"This track is unavailable",
		],
		// Real wording for a DRM-protected Vimeo video (yt-dlp 2026.10.26):
		[
			"[hlsnative] Downloading m3u8 manifest\nERROR: This format is DRM protected; Try selecting another format with --format or add --check-formats to automatically fallback to the next best format",
			"This track is copy-protected (DRM) and can't be converted",
		],
		[
			// A missing ffmpeg is the operator's problem, not "unavailable".
			"ERROR: Postprocessing: ffprobe and ffmpeg not found. Please install or provide the path",
			"The site refused to provide this track",
		],
		[
			"ERROR: [mixcloud] x: Requested format is not available. Use --list-formats for a list of available formats",
			"This track is only offered in a format TagTape can't stream",
		],
		["ERROR: something brand new", "The site refused to provide this track"],
	])("explains %j", (stderr, expected) => {
		expect(describeYtDlpFailure(stderr)).toBe(expected);
	});

	test("parses probe JSON", () => {
		expect(
			parseProbe(
				JSON.stringify({
					title: "T",
					duration: 212.4,
					live_status: "not_live",
					acodec: "opus",
				}),
			),
		).toEqual({
			title: "T",
			durationSeconds: 212,
			isLive: false,
			state: {
				// Kept verbatim for the stream step (in memory, never on disk).
				infoJson: JSON.stringify({
					title: "T",
					duration: 212.4,
					live_status: "not_live",
					acodec: "opus",
				}),
				sourceCodec: "opus",
			},
		});
		expect(
			parseProbe(JSON.stringify({ live_status: "is_upcoming" })),
		).toMatchObject({
			durationSeconds: null,
			isLive: true,
		});
	});
});
