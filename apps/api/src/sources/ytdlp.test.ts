import { PassThrough, Readable } from "node:stream";
import { buffer } from "node:stream/consumers";
import { describe, expect, test } from "vitest";
import { loadConfig } from "../config.ts";
import { UserFacingError } from "../lib/errors.ts";
import { ExecError, type run, type spawnStream } from "../lib/exec.ts";
import { createPipeline } from "../pipeline/index.ts";
import { createDirectSource } from "./direct.ts";
import {
	createYtDlpSource,
	describeYtDlpFailure,
	ffmpegArgs,
	matchSiteUrl,
	parseProbe,
	probeArgs,
	streamArgs,
	type YtDlpOptions,
	type YtDlpState,
} from "./ytdlp.ts";

const options: YtDlpOptions = {
	bin: "yt-dlp",
	ffmpegBin: "/usr/bin/ffmpeg",
	jsRuntime: "node",
	proxy: "http://127.0.0.1:9999",
	timeoutMs: 1000,
	maxChecks: 3,
};
const TRACK = "https://video.example.com/watch/abc123";
const after = (args: readonly string[], flag: string) =>
	args[args.indexOf(flag) + 1];
const info = (extra: object = {}) =>
	JSON.stringify({
		title: "Night Drive",
		duration: 212.4,
		live_status: "not_live",
		acodec: "opus",
		...extra,
	});
const execError = (stderr: string) =>
	new ExecError("yt-dlp exited with code 1", {
		exitCode: 1,
		stderr,
		timedOut: false,
	});

describe("yt-dlp arguments", () => {
	test("probe ends options before the URL and ignores config files", () => {
		const args = probeArgs(TRACK, options);
		expect(args).toContain("--ignore-config");
		expect(args).toContain("--no-cache-dir");
		expect(args).toContain("--no-playlist");
		expect(args).toContain("--flat-playlist");
		expect(args.slice(-2)).toEqual(["--", TRACK]);
		expect(after(args, "--js-runtimes")).toBe("node");
	});

	test("every run uses all extractors but generic, through the proxy", () => {
		for (const args of [probeArgs(TRACK, options), streamArgs(options)]) {
			expect(after(args, "--use-extractors")).toBe("default,-generic");
			expect(after(args, "--proxy")).toBe("http://127.0.0.1:9999");
			expect(args).not.toContain("--cookies");
		}
	});

	test("probe picks the same audio format the stream will use", () => {
		expect(after(probeArgs(TRACK, options), "-f")).toBe(
			after(streamArgs(options), "-f"),
		);
		expect(after(streamArgs(options), "-f")).toBe(
			"bestaudio[protocol!*=dash]/best[protocol!*=dash]",
		);
	});

	test("stream reads the probe from stdin and writes audio to stdout (no disk)", () => {
		const args = streamArgs(options);
		expect(after(args, "--load-info-json")).toBe("-");
		expect(after(args, "--output")).toBe("-");
		// yt-dlp's native HLS-to-stdout crashes; ffmpeg handles HLS.
		expect(after(args, "--downloader")).toBe("m3u8:ffmpeg");
		expect(after(args, "--ffmpeg-location")).toBe("/usr/bin/ffmpeg");
	});

	test("ffmpeg writes untagged, capped CBR MP3 from a pipe only", () => {
		const encode = ffmpegArgs("opus");
		expect(after(encode, "-c:a")).toBe("libmp3lame");
		expect(after(encode, "-b:a")).toBe("256k");
		expect(after(encode, "-id3v2_version")).toBe("0");
		expect(after(encode, "-write_id3v1")).toBe("0");
		expect(after(encode, "-write_xing")).toBe("0");
		expect(after(encode, "-protocol_whitelist")).toBe("pipe");
		expect(after(encode, "-t")).toBe("7200");
		expect(after(encode, "-i")).toBe("pipe:0");
		expect(encode.at(-1)).toBe("pipe:1");

		const copy = ffmpegArgs("mp3");
		expect(after(copy, "-c:a")).toBe("copy");
		expect(copy).not.toContain("-b:a");
	});

	test("the JS runtime flag can be disabled", () => {
		expect(probeArgs(TRACK, { ...options, jsRuntime: "" })).not.toContain(
			"--js-runtimes",
		);
	});
});

describe("matchSiteUrl", () => {
	test.each([
		[TRACK, TRACK],
		["http://music.example.org/t/1", "http://music.example.org/t/1"],
	])("claims %s", (input, expected) => {
		expect(matchSiteUrl(new URL(input))).toBe(expected);
	});

	test.each([
		"http://127.0.0.1/a",
		"http://[::1]/a",
		"http://10.0.0.5/a",
		"http://localhost/a",
		"http://intranet/a",
		"http://app.localhost/a",
		"http://printer.local/a",
		"http://db.internal/a",
	])("leaves %s alone", (input) => {
		expect(matchSiteUrl(new URL(input))).toBeNull();
	});
});

describe("describeYtDlpFailure", () => {
	test.each([
		[
			"ERROR: Unsupported URL: https://example.com/page",
			"TagTape can't read tracks from this link",
		],
		// Real wording with --use-extractors default,-generic (yt-dlp 2026.10.26):
		[
			"ERROR: No suitable extractor found for URL https://example.com/page",
			"TagTape can't read tracks from this link",
		],
		[
			"ERROR: [example] abc: Unable to download webpage: ('Unable to connect to proxy', OSError('Tunnel connection failed: 403 Forbidden'))",
			"This link couldn't be reached",
		],
		[
			"ERROR: [example] abc: Private video. Sign in if you've been granted access",
			"This track is private",
		],
		["ERROR: [example] abc: Video unavailable", "This track is unavailable"],
		[
			"ERROR: [example] abc: This video is no longer available",
			"This track is unavailable",
		],
		[
			"WARNING: x\nERROR: [example] abc: Sign in to confirm your age",
			"This track is age-restricted",
		],
		[
			"ERROR: [example] abc: This content is only available for registered users. Use --cookies",
			"This track is only available to signed-in, paying or subscribed users",
		],
		[
			"ERROR: [example] abc: This live stream recording is not available.",
			"This live stream's recording isn't available",
		],
		[
			"ERROR: [example] 123: Unable to download JSON metadata: HTTP Error 404: Not Found",
			"This track is unavailable",
		],
		[
			"[hlsnative] Downloading m3u8 manifest\nERROR: This format is DRM protected; Try selecting another format",
			"This track is copy-protected (DRM) and can't be converted",
		],
		[
			// A missing ffmpeg is the operator's problem, not "unavailable".
			"ERROR: Postprocessing: ffprobe and ffmpeg not found. Please install or provide the path",
			"The site refused to provide this track",
		],
		[
			"ERROR: [example] x: Requested format is not available. Use --list-formats",
			"This track is only offered in a format TagTape can't stream",
		],
		["ERROR: something brand new", "The site refused to provide this track"],
	])("explains %j", (stderr, expected) => {
		expect(describeYtDlpFailure(stderr)).toBe(expected);
	});
});

describe("parseProbe", () => {
	test("reads title, length and codec, and keeps the JSON for the stream", () => {
		expect(parseProbe(info())).toEqual({
			title: "Night Drive",
			durationSeconds: 212,
			isLive: false,
			state: { infoJson: info(), sourceCodec: "opus" },
		});
	});

	test("flags live and upcoming streams, and unknown lengths", () => {
		expect(
			parseProbe(JSON.stringify({ live_status: "is_upcoming" })),
		).toMatchObject({ durationSeconds: null, isLive: true });
	});

	test.each(["playlist", "multi_video"])("refuses a %s", (type) => {
		expect(() => parseProbe(JSON.stringify({ _type: type }))).toThrow(
			/single track/,
		);
	});
});

describe("source", () => {
	test("probe runs yt-dlp and turns failures into messages", async () => {
		const calls: string[][] = [];
		const fakeRun = (async (_bin, args) => {
			calls.push([...args]);
			if (args.at(-1) === TRACK) return { stdout: info(), stderr: "" };
			throw execError("ERROR: Unsupported URL: https://example.com/x");
		}) as typeof run;
		const source = createYtDlpSource({ ...options, run: fakeRun });
		const signal = new AbortController().signal;

		await expect(source.probe({ url: TRACK, signal })).resolves.toMatchObject({
			title: "Night Drive",
			durationSeconds: 212,
		});
		const failure = source.probe({ url: "https://example.com/x", signal });
		await expect(failure).rejects.toBeInstanceOf(UserFacingError);
		await expect(failure).rejects.toThrow(
			"TagTape can't read tracks from this link",
		);
		expect(calls).toHaveLength(2);
	});

	test("output that isn't JSON counts as unsupported", async () => {
		const fakeRun = (async () => ({
			stdout: "not json",
			stderr: "",
		})) as unknown as typeof run;
		const source = createYtDlpSource({ ...options, run: fakeRun });
		await expect(
			source.probe({ url: TRACK, signal: new AbortController().signal }),
		).rejects.toThrow("TagTape can't read tracks from this link");
	});

	test("no more than maxChecks yt-dlp checks at once", async () => {
		let running = 0;
		let peak = 0;
		const fakeRun = (async () => {
			running++;
			peak = Math.max(peak, running);
			await new Promise((resolve) => setTimeout(resolve, 10));
			running--;
			return { stdout: info(), stderr: "" };
		}) as unknown as typeof run;
		const source = createYtDlpSource({
			...options,
			maxChecks: 2,
			run: fakeRun,
		});
		const signal = new AbortController().signal;
		await Promise.all(
			Array.from({ length: 5 }, () => source.probe({ url: TRACK, signal })),
		);
		expect(peak).toBe(2);
	});

	test("downloads don't take check slots (long downloads can't starve checks)", async () => {
		const { fake } = fakeProcesses("mp3 bytes");
		let finishCheck = () => {};
		const slowRun = (() =>
			new Promise((resolve) => {
				finishCheck = () => resolve({ stdout: info(), stderr: "" });
			})) as unknown as typeof run;
		const source = createYtDlpSource({
			...options,
			maxChecks: 1,
			run: slowRun,
			spawnStream: fake,
		});
		const signal = new AbortController().signal;
		const check = source.probe({ url: TRACK, signal });
		const out = source.stream({ state, signal });
		expect((await buffer(out)).toString()).toBe("mp3 bytes");
		finishCheck();
		await check;
	});

	/** yt-dlp writes `audio` (or fails with `stderr`); ffmpeg copies stdin. */
	function fakeProcesses(audio: string, failWith?: string) {
		const commands: string[] = [];
		const fake = ((command, _args, { stdin }) => {
			commands.push(command);
			if (command === "yt-dlp") {
				const stdout = Readable.from([Buffer.from(audio)]);
				const done = failWith
					? Promise.reject(execError(failWith))
					: Promise.resolve();
				done.catch(() => {});
				return { stdout, done };
			}
			const stdout = new PassThrough();
			const input = stdin as Readable;
			input.pipe(stdout);
			const done = new Promise<void>((resolve) => input.once("end", resolve));
			return { stdout, done };
		}) as typeof spawnStream;
		return { fake, commands };
	}
	const state: YtDlpState = { infoJson: info(), sourceCodec: "opus" };

	test("stream pipes yt-dlp into ffmpeg and ends when both succeed", async () => {
		const { fake, commands } = fakeProcesses("mp3 bytes");
		const source = createYtDlpSource({ ...options, spawnStream: fake });
		const out = source.stream({ state, signal: new AbortController().signal });
		expect((await buffer(out)).toString()).toBe("mp3 bytes");
		expect(commands).toEqual(["yt-dlp", "/usr/bin/ffmpeg"]);
	});

	test("a failed download destroys the stream with yt-dlp's reason", async () => {
		const { fake } = fakeProcesses(
			"partial",
			"ERROR: This format is DRM protected",
		);
		const source = createYtDlpSource({ ...options, spawnStream: fake });
		const out = source.stream({ state, signal: new AbortController().signal });
		await expect(buffer(out)).rejects.toThrow(
			"This track is copy-protected (DRM) and can't be converted",
		);
	});

	test("version reports yt-dlp's", async () => {
		const fakeRun = (async () => ({
			stdout: "2026.10.26\n",
			stderr: "",
		})) as unknown as typeof run;
		const source = createYtDlpSource({ ...options, run: fakeRun });
		await expect(source.version?.()).resolves.toBe("2026.10.26");
	});
});

describe("source order", () => {
	const pipeline = createPipeline(loadConfig({ API_TOKEN: "t".repeat(32) }), [
		createDirectSource({ ffmpegBin: "ffmpeg", maxBytes: 1, timeoutMs: 1 }),
		createYtDlpSource(options),
	]);

	test("MP3 files stay with the direct source; other links go to yt-dlp", () => {
		expect(pipeline.resolve("https://files.example.com/a/song.mp3")).toEqual({
			source: "direct",
			url: "https://files.example.com/a/song.mp3",
		});
		expect(pipeline.resolve("video.example.com/watch/abc123")).toEqual({
			source: "ytdlp",
			url: TRACK,
		});
	});

	test("private hosts are claimed by neither", () => {
		expect(pipeline.resolve("http://192.168.1.1/admin")).toBeNull();
		expect(pipeline.resolve("http://localhost/x")).toBeNull();
	});
});
