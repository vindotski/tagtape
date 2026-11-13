import { createServer, type Server } from "node:http";
import type { AddressInfo, LookupFunction } from "node:net";
import { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";
import { createTag } from "@tagtape/shared";
import NodeID3 from "node-id3";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { UserFacingError } from "../lib/errors.ts";
import { readZip } from "../test/helpers.ts";
import { streamZip } from "./archive.ts";
import { COVER_SIZE, downloadImage, processCover } from "./cover.ts";

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
			downloadImage(`${base}/cover.png`, {
				signal: signal(),
				testPort: new URL(base).port,
			}),
		).rejects.toThrow("couldn't be reached");
	});

	test("downloads and follows redirects", async () => {
		const image = await downloadImage(`${base}/redirect`, {
			signal: signal(),
			lookup: anyAddress,
			testPort: new URL(base).port,
		});
		expect((await sharp(image).metadata()).width).toBe(1600);
	});

	test.each([
		["/page", "doesn't point to an image"],
		["/missing", "HTTP 404"],
	])("rejects %s", async (path, message) => {
		await expect(
			downloadImage(`${base}${path}`, {
				signal: signal(),
				lookup: anyAddress,
				testPort: new URL(base).port,
			}),
		).rejects.toThrow(message);
	});

	test("enforces the size cap", async () => {
		await expect(
			downloadImage(`${base}/huge-chunked`, {
				signal: signal(),
				lookup: anyAddress,
				testPort: new URL(base).port,
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

	test.each([
		[
			"a GIF",
			() =>
				sharp({
					create: { width: 10, height: 10, channels: 3, background: "#000" },
				})
					.gif()
					.toBuffer(),
			"must be a JPEG, PNG or WebP",
		],
		[
			"an SVG",
			async () =>
				Buffer.from(
					'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
				),
			"must be a JPEG, PNG or WebP",
		],
		[
			// 8000×8000 = 64 MP of one colour: a few KB as PNG, ~200 MB decoded.
			"a decompression bomb",
			() =>
				sharp({
					create: {
						width: 8000,
						height: 8000,
						channels: 3,
						background: "#fff",
					},
				})
					.png({ compressionLevel: 9 })
					.toBuffer(),
			"too many pixels",
		],
	])("rejects %s", async (_label, make, message) => {
		await expect(processCover(await make())).rejects.toThrow(message);
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
		const tag = Buffer.from(
			createTag({
				title: "Neon Rain",
				artist: "The Examples",
				album: "Night Drive",
				trackNumber: 1,
				trackTotal: 10,
				year: "2026",
				genre: "Synthwave",
				cover,
			}),
		);
		expect(tag.subarray(0, 3).toString()).toBe("ID3");
		expect(tag[3]).toBe(3); // ID3v2.3

		const tags = NodeID3.read(
			Buffer.concat([tag, Buffer.from([0xff, 0xfb, 0x90, 0x64])]),
		);
		expect(tags).toMatchObject({
			title: "Neon Rain",
			artist: "The Examples",
			performerInfo: "The Examples",
			album: "Night Drive",
			trackNumber: "1/10",
			year: "2026",
			genre: "Synthwave",
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
