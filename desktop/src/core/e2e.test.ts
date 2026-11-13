/**
 * Opt-in end-to-end test: the real pipeline with the bundled ffmpeg and
 * yt-dlp (`pnpm binaries` first), and the network.
 *
 *   TAGTAPE_E2E=1 pnpm --filter @tagtape/desktop exec vitest run src/core/e2e.test.ts
 *
 * Converts two public, freely licensed MP3 files through the built-in direct
 * source: both are CBR, so they're copied, not re-encoded.
 *
 * With TAGTAPE_E2E_SITE_URLS (comma-separated track links, kept out of the
 * repo), it also converts those through the yt-dlp source.
 */
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import NodeID3 from "node-id3";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createTagTape, type TagTape } from "./index.ts";
import { binaryPaths } from "./lib/binaries.ts";

const ENABLED = process.env.TAGTAPE_E2E === "1";
const SITE_URLS = (process.env.TAGTAPE_E2E_SITE_URLS ?? "")
	.split(",")
	.map((url) => url.trim())
	.filter(Boolean);

const log = {
	info() {},
	warn: (obj: object, msg: string) => console.warn(msg, obj),
	error: (obj: object, msg: string) => console.error(msg, obj),
};

/** Our tag is the only one, and the audio is plain MPEG frames with no Xing header. */
function expectOnlyOurTag(audio: Buffer) {
	expect(audio[0]).toBe(0xff);
	expect((audio[1] as number) & 0xe0).toBe(0xe0);
	expect(audio.subarray(0, 400).includes("Xing")).toBe(false);
	expect(audio.subarray(0, 400).includes("Info")).toBe(false);
	// No ID3v1 tag either (it would be the last 128 bytes, starting "TAG").
	// Searching all the audio for "ID3" would be wrong: those 3 bytes turn
	// up by chance in megabytes of compressed audio.
	expect(audio.subarray(-128, -125).toString("latin1")).not.toBe("TAG");
}

/** MPEG-1 Layer III bitrate table (kbps) by header index. */
const MP3_BITRATES = [
	0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
];

/** Splits a file into its ID3v2 tag and the audio after it (tag size is syncsafe). */
function splitTag(file: Buffer): { tag: Buffer; audio: Buffer } {
	expect(file.subarray(0, 3).toString()).toBe("ID3");
	const size =
		((file[6] as number) << 21) |
		((file[7] as number) << 14) |
		((file[8] as number) << 7) |
		(file[9] as number);
	return { tag: file.subarray(0, 10 + size), audio: file.subarray(10 + size) };
}

const tracks = [
	{
		title: "Тест ✓ Helix",
		// SoundHelix's generated demo songs, widely used as test audio.
		url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
		kbps: 192,
		seconds: 373,
	},
	{
		title: "Archive test",
		url: "archive.org/download/testmp3testfile/mpthreetest.mp3",
		kbps: 128,
		seconds: 12,
	},
];

describe.skipIf(!ENABLED)("end to end (bundled ffmpeg and yt-dlp)", () => {
	let tagtape: TagTape;
	let destination: string;

	beforeAll(async () => {
		const bin = binaryPaths(
			fileURLToPath(new URL("../../resources/bin", import.meta.url)),
		);
		tagtape = await createTagTape({
			ffmpegBin: bin.ffmpeg,
			ytdlpBin: bin.ytdlp,
			jsRuntime: `node:${process.execPath}`,
			log,
		});
		destination = await mkdtemp(join(tmpdir(), "tagtape-e2e-"));
	});
	afterAll(async () => {
		await tagtape?.close();
		if (destination) await rm(destination, { recursive: true, force: true });
	});

	/** Starts an album and waits until it's saved; returns its folder. */
	async function make(album: object): Promise<string> {
		const created = tagtape.createJob(album, destination);
		if (created.kind !== "ok") throw new Error(JSON.stringify(created));
		for (;;) {
			const job = tagtape.getJob(created.jobId);
			if (job?.status === "done" && job.folder) return job.folder;
			if (!job || job.status === "failed") {
				throw new Error(JSON.stringify(job));
			}
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
	}

	test("the bundled programs run", async () => {
		const versions = await tagtape.versions();
		expect(versions.ffmpeg).toMatch(/^ffmpeg version /);
		expect(versions.ytdlp).toMatch(/^\d{4}\.\d{2}\.\d{2}/);
	});

	test("MP3 links + cover → a folder of tagged MP3s", {
		timeout: 300_000,
	}, async () => {
		const started = Date.now();
		const folder = await make({
			title: "E2E Album",
			artist: "Various",
			year: "2005",
			genre: "Test",
			coverUrl:
				"https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg",
			tracks: tracks.map(({ title, url }) => ({ title, url })),
		});
		expect(folder).toBe(join(destination, "Various - E2E Album"));
		expect((await readdir(folder)).sort()).toEqual([
			"01 - Тест ✓ Helix.mp3",
			"02 - Archive test.mp3",
		]);

		let bytes = 0;
		for (const [index, expected] of tracks.entries()) {
			const file = await readFile(
				join(folder, `0${index + 1} - ${expected.title}.mp3`),
			);
			bytes += file.length;
			const { tag, audio } = splitTag(file);

			const tags = NodeID3.read(tag);
			expect(tags).toMatchObject({
				title: expected.title,
				artist: "Various",
				performerInfo: "Various",
				album: "E2E Album",
				trackNumber: `${index + 1}/2`,
				year: "2005",
				genre: "Test",
			});
			const image = tags.image as { type: { id: number }; imageBuffer: Buffer };
			expect(image.type.id).toBe(3);
			expect(await sharp(image.imageBuffer).metadata()).toMatchObject({
				format: "jpeg",
				width: 1000,
				height: 1000,
			});

			expectOnlyOurTag(audio);
			expect(MP3_BITRATES[(audio[2] as number) >> 4]).toBe(expected.kbps);
			// CBR: duration follows from size and bitrate.
			const seconds = (audio.length * 8) / (expected.kbps * 1000);
			expect(Math.abs(seconds - expected.seconds)).toBeLessThan(2);
		}
		console.info(`saved ${bytes} bytes in ${Date.now() - started} ms`);
	});

	test.skipIf(SITE_URLS.length === 0)(
		"site links → a folder of tagged MP3s",
		{ timeout: 600_000 },
		async () => {
			const folder = await make({
				title: "E2E Sites",
				artist: "Various",
				tracks: SITE_URLS.map((url, i) => ({ title: `Site ${i + 1}`, url })),
			});
			const names = (await readdir(folder)).sort();
			expect(names).toEqual(
				SITE_URLS.map(
					(_, i) => `${String(i + 1).padStart(2, "0")} - Site ${i + 1}.mp3`,
				),
			);
			for (const name of names) {
				const { tag, audio } = splitTag(await readFile(join(folder, name)));
				expect(NodeID3.read(tag)).toMatchObject({ album: "E2E Sites" });
				expectOnlyOurTag(audio);
				// Copied MP3 keeps its bitrate; anything else is 256 kbps CBR.
				expect(MP3_BITRATES[(audio[2] as number) >> 4]).toBeGreaterThan(0);
				expect(audio.length).toBeGreaterThan(100_000);
			}
		},
	);
});
