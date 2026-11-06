import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo, LookupFunction } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import NodeID3 from "node-id3";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { UserFacingError } from "../lib/errors.ts";
import { writeArchive } from "./archive.ts";
import { COVER_SIZE, downloadImage, processCover } from "./cover.ts";
import { writeTags } from "./tags.ts";
import {
	describeYtDlpFailure,
	downloadArgs,
	parseProbe,
	probeArgs,
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
			downloadArgs("/tmp/j/1.info.json", "/tmp/j/1.%(ext)s", ytOptions),
		]) {
			expect(args[args.indexOf("--use-extractors") + 1]).toBe(
				"youtube,soundcloud,Bandcamp,mixcloud,vimeo",
			);
		}
	});

	test("download reuses the probe JSON and converts to best-quality MP3", () => {
		const args = downloadArgs(
			"/tmp/j/1.info.json",
			"/tmp/j/1.%(ext)s",
			ytOptions,
		);
		const after = (flag: string) => args[args.indexOf(flag) + 1];
		expect(after("--load-info-json")).toBe("/tmp/j/1.info.json");
		expect(after("--audio-format")).toBe("mp3");
		expect(after("--audio-quality")).toBe("0");
		expect(after("--ffmpeg-location")).toBe("/usr/bin/ffmpeg");
		expect(after("--output")).toBe("/tmp/j/1.%(ext)s");
		expect(args).toContain("--extract-audio");
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
				}),
			),
		).toEqual({
			title: "T",
			durationSeconds: 212,
			isLive: false,
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
	test("writes ID3 tags including the front cover", async () => {
		const dir = await mkdtemp(join(tmpdir(), "tagtape-tags-"));
		const mp3 = join(dir, "1.mp3");
		await writeFile(mp3, Buffer.alloc(256));
		const cover = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

		await writeTags(mp3, {
			title: "Never Gonna Give You Up",
			artist: "Rick Astley",
			album: "Whenever You Need Somebody",
			trackNumber: 1,
			trackTotal: 10,
			year: "1987",
			genre: "Pop",
			cover,
		});

		const tags = NodeID3.read(mp3);
		expect(tags).toMatchObject({
			title: "Never Gonna Give You Up",
			artist: "Rick Astley",
			performerInfo: "Rick Astley",
			album: "Whenever You Need Somebody",
			trackNumber: "1/10",
			year: "1987",
			genre: "Pop",
		});
		const image = tags.image as {
			mime: string;
			type: { id: number };
			imageBuffer: Buffer;
		};
		expect(image.type.id).toBe(3);
		expect(image.imageBuffer.equals(cover)).toBe(true);
	});

	test("zips files uncompressed under their display names", async () => {
		const dir = await mkdtemp(join(tmpdir(), "tagtape-zip-"));
		await writeFile(join(dir, "1.mp3"), "one");
		await writeFile(join(dir, "2.mp3"), "two");
		const out = join(dir, "album.zip");

		await writeArchive({
			entries: [
				{ path: join(dir, "1.mp3"), name: "01 - Ниночка.mp3" },
				{ path: join(dir, "2.mp3"), name: "02 - Two.mp3" },
			],
			outPath: out,
			signal: new AbortController().signal,
		});

		const zip = await readFile(out);
		expect(zip.readUInt32LE(0)).toBe(0x04034b50); // local file header
		expect(zip.readUInt16LE(8)).toBe(0); // compression method 0 = stored
		expect(zip.includes(Buffer.from("01 - Ниночка.mp3"))).toBe(true);
		expect(zip.includes(Buffer.from("two"))).toBe(true);
	});
});
