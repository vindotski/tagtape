/**
 * Opt-in end-to-end test: the real pipeline with the bundled ffmpeg and
 * yt-dlp (`pnpm binaries` first), and the network.
 *
 *   TAGTAPE_E2E=1 pnpm --filter @tagtape/desktop exec vitest run src/core/e2e.test.ts
 *
 * Every link comes from the environment, never from the repo (which names
 * no sites); a part without its links is skipped:
 *
 * - TAGTAPE_E2E_MP3_URLS: comma-separated direct links to freely licensed,
 *   constant-bitrate MP3 files, for the built-in direct source (they are
 *   copied, not re-encoded). TAGTAPE_E2E_COVER_URL: an image for the cover.
 * - TAGTAPE_E2E_SITE_URLS: comma-separated track links for the yt-dlp source.
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
const list = (value: string | undefined) =>
	(value ?? "")
		.split(",")
		.map((url) => url.trim())
		.filter(Boolean);
const MP3_URLS = list(process.env.TAGTAPE_E2E_MP3_URLS);
const COVER_URL = process.env.TAGTAPE_E2E_COVER_URL?.trim() || undefined;
const SITE_URLS = list(process.env.TAGTAPE_E2E_SITE_URLS);

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

// The first title checks that tags and file names keep non-ASCII text.
const tracks = MP3_URLS.map((url, index) => ({
	title: index === 0 ? "Тест ✓ One" : `Track ${index + 1}`,
	url,
}));
const number = (index: number) => String(index + 1).padStart(2, "0");

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

	test.skipIf(tracks.length === 0)(
		"MP3 links + cover → a folder of tagged MP3s",
		{
			timeout: 300_000,
		},
		async () => {
			const started = Date.now();
			const folder = await make({
				title: "E2E Album",
				artist: "Various",
				year: "2005",
				genre: "Test",
				...(COVER_URL ? { coverUrl: COVER_URL } : {}),
				tracks: tracks.map(({ title, url }) => ({ title, url })),
			});
			expect(folder).toBe(join(destination, "Various - E2E Album"));
			expect((await readdir(folder)).sort()).toEqual(
				tracks.map((track, index) => `${number(index)} - ${track.title}.mp3`),
			);

			let bytes = 0;
			for (const [index, expected] of tracks.entries()) {
				const file = await readFile(
					join(folder, `${number(index)} - ${expected.title}.mp3`),
				);
				bytes += file.length;
				const { tag, audio } = splitTag(file);

				const tags = NodeID3.read(tag);
				expect(tags).toMatchObject({
					title: expected.title,
					artist: "Various",
					performerInfo: "Various",
					album: "E2E Album",
					trackNumber: `${index + 1}/${tracks.length}`,
					year: "2005",
					genre: "Test",
				});
				if (COVER_URL) {
					const image = tags.image as {
						type: { id: number };
						imageBuffer: Buffer;
					};
					expect(image.type.id).toBe(3);
					expect(await sharp(image.imageBuffer).metadata()).toMatchObject({
						format: "jpeg",
						width: 1000,
						height: 1000,
					});
				}

				expectOnlyOurTag(audio);
				// Copied as it was: a real MPEG bitrate, and real audio after the tag.
				expect(MP3_BITRATES[(audio[2] as number) >> 4]).toBeGreaterThan(0);
				expect(audio.length).toBeGreaterThan(100_000);
			}
			console.info(`saved ${bytes} bytes in ${Date.now() - started} ms`);
		},
	);

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
