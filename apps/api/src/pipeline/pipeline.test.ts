import { createServer, type Server } from "node:http";
import type { AddressInfo, LookupFunction } from "node:net";
import { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";
import NodeID3 from "node-id3";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { UserFacingError } from "../lib/errors.ts";
import { readZip } from "../test/helpers.ts";
import { streamZip } from "./archive.ts";
import { COVER_SIZE, downloadImage, processCover } from "./cover.ts";
import { createTag } from "./tags.ts";
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
			sourceCodec: "opus",
			// Kept verbatim for the stream step (in memory, never on disk).
			infoJson: JSON.stringify({
				title: "T",
				duration: 212.4,
				live_status: "not_live",
				acodec: "opus",
			}),
		});
		expect(
			parseProbe(JSON.stringify({ live_status: "is_upcoming" })),
		).toMatchObject({
			durationSeconds: null,
			isLive: true,
		});
	});
});

describe("cover", () => {
	let server: Server;
	let base: string;
	const png = () =>
		sharp({
			create: { width: 1600, height: 900, channels: 3, background: "#3a7" },
		})
			.png()
			.toBuffer();

	beforeAll(async () => {
		const image = await png();
		server = createServer((req, res) => {
			if (req.url === "/cover.png") {
				res.writeHead(200, {
					"content-type": "image/png",
					"content-length": image.length,
				});
				res.end(image);
			} else if (req.url === "/redirect") {
				res.writeHead(302, { location: "/cover.png" });
				res.end();
			} else if (req.url === "/page") {
				res.writeHead(200, { "content-type": "text/html" });
				res.end("<html></html>");
			} else if (req.url === "/huge-chunked") {
				res.writeHead(200, { "content-type": "image/jpeg" });
				res.end(Buffer.alloc(2048));
			} else {
				res.writeHead(404);
				res.end();
			}
		});
		await new Promise<void>((resolve) =>
			server.listen(0, "127.0.0.1", resolve),
		);
		base = `http://localhost:${(server.address() as AddressInfo).port}`;
	});
	afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

	// Tests talk to a local server, so they swap the SSRF-guarded lookup for a plain one.
	const anyAddress: LookupFunction = (_host, options, callback) =>
		options.all
			? (
					callback as (
						e: null,
						a: { address: string; family: number }[],
					) => void
				)(null, [{ address: "127.0.0.1", family: 4 }])
			: callback(null, "127.0.0.1", 4);
	const signal = () => new AbortController().signal;

	test("blocks private addresses by default (SSRF)", async () => {
		await expect(
			downloadImage(`${base}/cover.png`, { signal: signal() }),
		).rejects.toThrow("private network");
	});

	test("downloads and follows redirects", async () => {
		const image = await downloadImage(`${base}/redirect`, {
			signal: signal(),
			lookup: anyAddress,
		});
		expect((await sharp(image).metadata()).width).toBe(1600);
	});

	test.each([
		["/page", "doesn't point to an image"],
		["/missing", "HTTP 404"],
	])("rejects %s", async (path, message) => {
		await expect(
			downloadImage(`${base}${path}`, { signal: signal(), lookup: anyAddress }),
		).rejects.toThrow(message);
	});

	test("enforces the size cap", async () => {
		await expect(
			downloadImage(`${base}/huge-chunked`, {
				signal: signal(),
				lookup: anyAddress,
				maxBytes: 1024,
			}),
		).rejects.toBeInstanceOf(UserFacingError);
	});

	test("centre-crops to a 1000×1000 JPEG instead of stretching", async () => {
		const cover = await processCover(await png());
		const meta = await sharp(cover).metadata();
		expect(meta).toMatchObject({
			format: "jpeg",
			width: COVER_SIZE,
			height: COVER_SIZE,
		});
	});

	test("rejects data that isn't an image", async () => {
		await expect(
			processCover(Buffer.from("not an image")),
		).rejects.toBeInstanceOf(UserFacingError);
	});
});

describe("tags and archive", () => {
	test("builds an ID3 tag (with front cover) to put in front of the audio", () => {
		const cover = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
		const tag = createTag({
			title: "Never Gonna Give You Up",
			artist: "Rick Astley",
			album: "Whenever You Need Somebody",
			trackNumber: 1,
			trackTotal: 10,
			year: "1987",
			genre: "Pop",
			cover,
		});
		expect(tag.subarray(0, 3).toString()).toBe("ID3");
		expect(tag[3]).toBe(3); // ID3v2.3

		const tags = NodeID3.read(
			Buffer.concat([tag, Buffer.from([0xff, 0xfb, 0x90, 0x64])]),
		);
		expect(tags).toMatchObject({
			title: "Never Gonna Give You Up",
			artist: "Rick Astley",
			performerInfo: "Rick Astley",
			album: "Whenever You Need Somebody",
			trackNumber: "1/10",
			year: "1987",
			genre: "Pop",
		});
		const image = tags.image as { type: { id: number }; imageBuffer: Buffer };
		expect(image.type.id).toBe(3);
		expect(image.imageBuffer.equals(cover)).toBe(true);
	});

	test("streams a stored ZIP, opening entries one after another", async () => {
		const opened: string[] = [];
		const entry = (name: string, body: string) => ({
			name,
			open: () => {
				opened.push(name);
				return Readable.from([Buffer.from(body)]);
			},
		});
		const zip = streamZip([
			entry("01 - Ниночка.mp3", "one"),
			entry("02 - Two.mp3", "two"),
		]);
		// yazl starts the first entry right away, but never two at once.
		expect(opened.length).toBeLessThanOrEqual(1);

		const entries = readZip(await buffer(zip));
		expect(entries.map((e) => [e.name, e.method, e.data.toString()])).toEqual([
			["01 - Ниночка.mp3", 0, "one"],
			["02 - Two.mp3", 0, "two"],
		]);
		expect(opened).toEqual(["01 - Ниночка.mp3", "02 - Two.mp3"]);
	});

	test("a failing entry destroys the ZIP stream and later entries never open", async () => {
		const opened: string[] = [];
		const zip = streamZip([
			{
				name: "01.mp3",
				open: () => {
					opened.push("01");
					const stream = new Readable({ read() {} });
					setImmediate(() => stream.destroy(new Error("boom")));
					return stream;
				},
			},
			{
				name: "02.mp3",
				open: () => {
					opened.push("02");
					return Readable.from(["x"]);
				},
			},
		]);
		await expect(buffer(zip)).rejects.toThrow("boom");
		expect(opened).toEqual(["01"]);
	});
});
