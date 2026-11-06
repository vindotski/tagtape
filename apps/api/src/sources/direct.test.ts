import { createServer, type Server } from "node:http";
import type { AddressInfo, LookupFunction } from "node:net";
import { PassThrough, type Readable } from "node:stream";
import { buffer } from "node:stream/consumers";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { spawnStream } from "../lib/exec.ts";
import { createDirectSource, ffmpegArgs } from "./direct.ts";
import { readMp3Info } from "./mp3.ts";

// --- MP3 fixtures: MPEG-1 Layer III, 128 kbps, 44.1 kHz, joint stereo.
const FRAME_LENGTH = 417; // 144 * 128000 / 44100, no padding
const frame = (body?: (frame: Buffer) => void) => {
	const f = Buffer.alloc(FRAME_LENGTH);
	f.set([0xff, 0xfb, 0x90, 0x64]);
	body?.(f);
	return f;
};
/** First frame carrying a Xing ("Xing" = VBR) or Info (CBR) header with a frame count. */
const xingFrame = (tag: "Xing" | "Info", frames: number) =>
	frame((f) => {
		f.write(tag, 36, "latin1"); // 4-byte header + 32 bytes of side info
		f.writeUInt32BE(0x1, 40); // flags: frame count present
		f.writeUInt32BE(frames, 44);
	});
const id3 = (size: number) => {
	const tag = Buffer.alloc(10 + size);
	tag.write("ID3", 0, "latin1");
	tag.set([3, 0, 0]);
	tag.set(
		[(size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f],
		6,
	);
	return tag;
};
const frames = (n: number) =>
	Buffer.concat(Array.from({ length: n }, () => frame()));

/** ~10 s of CBR audio (1152 samples per frame at 44.1 kHz), behind a 2 KB tag. */
const CBR = Buffer.concat([id3(2048), frames(383)]);
/** A VBR file whose Xing header says 1000 frames (≈ 26 s). */
const VBR = Buffer.concat([xingFrame("Xing", 1000), frames(30)]);

describe("readMp3Info", () => {
	test("CBR without a header: length from file size and bitrate", () => {
		expect(readMp3Info(CBR, CBR.length)).toEqual({
			audioOffset: 2058,
			bitrateKbps: 128,
			sampleRate: 44100,
			vbr: false,
			durationSeconds: 10,
		});
		// Without a size there's no way to tell.
		expect(readMp3Info(CBR, null)?.durationSeconds).toBeNull();
	});

	test("Xing (VBR) and Info (CBR) headers give the exact length", () => {
		expect(readMp3Info(VBR, null)).toMatchObject({
			vbr: true,
			durationSeconds: 26,
		});
		const info = Buffer.concat([xingFrame("Info", 383), frames(5)]);
		expect(readMp3Info(info, null)).toMatchObject({
			vbr: false,
			durationSeconds: 10,
		});
	});

	test("VBRI (Fraunhofer) headers", () => {
		const vbri = frame((f) => {
			f.write("VBRI", 36, "latin1");
			f.writeUInt32BE(2000, 36 + 14);
		});
		expect(readMp3Info(Buffer.concat([vbri, frames(3)]), null)).toMatchObject({
			vbr: true,
			durationSeconds: 52,
		});
	});

	test.each([
		["an HTML page", Buffer.from("<!doctype html><html>…</html>".repeat(50))],
		[
			"a lone false sync",
			Buffer.concat([
				Buffer.from([0xff, 0xfb, 0x90, 0x64]),
				Buffer.alloc(2000, 1),
			]),
		],
		["an ID3 tag with nothing after it", id3(100)],
	])("rejects %s", (_label, data) => {
		expect(readMp3Info(data, data.length)).toBeNull();
	});
});

// --- The source, against a local server.
let server: Server;
let base: string;
const sockets = new Set<import("node:net").Socket>();
const anyAddress: LookupFunction = (_host, options, callback) =>
	options.all
		? (callback as (e: null, a: { address: string; family: number }[]) => void)(
				null,
				[{ address: "127.0.0.1", family: 4 }],
			)
		: callback(null, "127.0.0.1", 4);

beforeAll(async () => {
	server = createServer((req, res) => {
		const send = (type: string, body: Buffer) => {
			res.writeHead(200, {
				"content-type": type,
				"content-length": body.length,
			});
			res.end(body);
		};
		switch (req.url) {
			case "/cbr.mp3":
				return send("audio/mpeg", CBR);
			case "/vbr.mp3":
				return send("audio/mpeg; charset=binary", VBR);
			case "/page.mp3":
				return send("text/html", Buffer.from("<html></html>"));
			case "/fake.mp3":
				return send("application/octet-stream", Buffer.alloc(20_000, 7));
			case "/big.mp3":
				res.writeHead(200, {
					"content-type": "audio/mpeg",
					"content-length": 999_999_999,
				});
				return res.end();
			case "/cut.mp3":
				// Promises the whole file, then hangs up halfway.
				res.writeHead(200, {
					"content-type": "audio/mpeg",
					"content-length": CBR.length,
				});
				res.write(CBR.subarray(0, CBR.length / 2));
				return setTimeout(() => res.socket?.destroy(), 20);
			case "/endless.mp3":
				res.writeHead(200, { "content-type": "audio/mpeg" });
				res.write(CBR);
				return; // never ends
			case "/to-metadata.mp3":
				res.writeHead(302, { location: "http://169.254.169.254/latest.mp3" });
				return res.end();
			case "/moved.mp3":
				res.writeHead(302, { location: "/cbr.mp3" });
				return res.end();
			default:
				res.writeHead(404);
				return res.end();
		}
	});
	server.on("connection", (socket) => {
		sockets.add(socket);
		socket.once("close", () => sockets.delete(socket));
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
	for (const socket of sockets) socket.destroy();
	await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** Stands in for ffmpeg: copies stdin to stdout and exits 0 when its input ends (as ffmpeg does, even when cut off). */
const fakeFfmpeg = ((_cmd, _args, { stdin, signal }) => {
	const stdout = new PassThrough();
	const input = stdin as Readable;
	input.pipe(stdout);
	const done = new Promise<void>((resolve, reject) => {
		input.once("end", resolve);
		input.once("error", () => resolve());
		signal.addEventListener("abort", () => {
			stdout.destroy();
			reject(new DOMException("killed", "AbortError"));
		});
	});
	done.catch(() => {});
	return { stdout, done };
}) as typeof spawnStream;

const source = (
	overrides: { maxBytes?: number; lookup?: LookupFunction | null } = {},
) =>
	createDirectSource({
		ffmpegBin: "ffmpeg",
		maxBytes: overrides.maxBytes ?? 1024 * 1024,
		timeoutMs: 10_000,
		spawnStream: fakeFfmpeg,
		...(overrides.lookup === null
			? {}
			: { lookup: overrides.lookup ?? anyAddress }),
	});
const signal = () => new AbortController().signal;
const probe = (path: string, s = source()) =>
	s.probe({ url: `${base}${path}`, signal: signal() });

describe("direct MP3 source", () => {
	test("claims only links to .mp3 files, without the fragment", () => {
		const s = source();
		expect(
			s.match(new URL("https://cdn.example.com/a/Night%20Drive.MP3?x=1#t=5")),
		).toBe("https://cdn.example.com/a/Night%20Drive.MP3?x=1");
		expect(s.match(new URL("https://cdn.example.com/watch?v=abc"))).toBeNull();
		expect(
			s.match(new URL("https://cdn.example.com/song.mp3/page")),
		).toBeNull();
	});

	test("probes only the head of the file", async () => {
		expect(await probe("/cbr.mp3")).toEqual({
			title: "cbr",
			durationSeconds: 10,
			isLive: false,
			state: { url: `${base}/cbr.mp3`, vbr: false },
		});
		expect((await probe("/vbr.mp3")).state).toMatchObject({ vbr: true });
		expect((await probe("/moved.mp3")).durationSeconds).toBe(10);
	});

	test.each([
		["/page.mp3", "doesn't point to an MP3 file"],
		["/fake.mp3", "doesn't point to an MP3 file"],
		["/missing.mp3", "answered with HTTP 404"],
		["/big.mp3", "larger than 1 MB"],
	])("rejects %s", async (path, message) => {
		await expect(probe(path)).rejects.toThrow(message);
	});

	test("blocks private addresses (SSRF)", async () => {
		await expect(probe("/cbr.mp3", source({ lookup: null }))).rejects.toThrow(
			"private network",
		);
	});

	// Node never calls `lookup` for IP-literal hosts, so these must be caught
	// even when the lookup lets everything through.
	test.each([
		"http://127.0.0.1/a.mp3",
		"http://169.254.169.254/latest.mp3",
		"http://[::1]/a.mp3",
		"http://[::ffff:10.0.0.1]/a.mp3",
	])("blocks the private IP literal %s", async (url) => {
		await expect(source().probe({ url, signal: signal() })).rejects.toThrow(
			"private network",
		);
	});

	test("blocks a redirect to a private IP literal", async () => {
		await expect(probe("/to-metadata.mp3")).rejects.toThrow("private network");
	});

	test("streams the file through ffmpeg", async () => {
		const s = source();
		const { state } = await probe("/cbr.mp3", s);
		expect(await buffer(s.stream({ state, signal: signal() }))).toEqual(CBR);
	});

	test("a download cut off halfway fails instead of passing as complete", async () => {
		const s = source();
		const stream = s.stream({
			state: { url: `${base}/cut.mp3`, vbr: false },
			signal: signal(),
		});
		await expect(buffer(stream)).rejects.toThrow("cut off");
	});

	test("a stream over the size cap fails", async () => {
		const s = source({ maxBytes: 1000 });
		const stream = s.stream({
			state: { url: `${base}/endless.mp3`, vbr: false },
			signal: signal(),
		});
		await expect(buffer(stream)).rejects.toThrow("larger than");
	});

	test("aborting stops the download and the conversion", async () => {
		const controller = new AbortController();
		const stream = source().stream({
			state: { url: `${base}/endless.mp3`, vbr: false },
			signal: controller.signal,
		});
		stream.once("data", () => controller.abort());
		await expect(buffer(stream)).rejects.toThrow();
		await expect.poll(() => sockets.size).toBe(0);
	});

	test("ffmpeg copies CBR, re-encodes VBR, and writes no tags or Xing header", () => {
		const after = (args: string[], flag: string) =>
			args[args.indexOf(flag) + 1];
		const copy = ffmpegArgs(false);
		expect(after(copy, "-c:a")).toBe("copy");
		expect(after(copy, "-f")).toBe("mp3"); // input must be MP3
		expect(after(copy, "-write_xing")).toBe("0");
		expect(after(copy, "-id3v2_version")).toBe("0");
		const encode = ffmpegArgs(true);
		expect(after(encode, "-c:a")).toBe("libmp3lame");
		expect(after(encode, "-b:a")).toBe("256k");
	});
});
