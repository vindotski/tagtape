/**
 * Opt-in end-to-end test against a running API with the real yt-dlp and ffmpeg,
 * e.g. the TagTape image with its internal API exposed on purpose:
 *
 *   docker run -d -p 127.0.0.1:4100:4000 -e API_HOST=0.0.0.0 -e API_TOKEN=$TOKEN tagtape
 *   TAGTAPE_E2E_URL=http://127.0.0.1:4100 TAGTAPE_E2E_TOKEN=$TOKEN \
 *     pnpm --filter @tagtape/api exec vitest run src/e2e.test.ts
 *
 * Covers the three audio paths of the streaming pipeline, with short, stable
 * tracks (needs the network):
 *   - YouTube "Me at the zoo" (19 s, Opus → MP3 256 kbps CBR)
 *   - SoundCloud "Flickermood" (3:33, HLS via ffmpeg → MP3 256 kbps CBR)
 *   - Bandcamp yt-dlp test song (9 s, already MP3 → copied, 128 kbps)
 */
import { jobSnapshotSchema } from "@tagtape/shared";
import NodeID3 from "node-id3";
import sharp from "sharp";
import { describe, expect, test } from "vitest";
import { readZip } from "./test/helpers.ts";

const BASE = process.env.TAGTAPE_E2E_URL;
const TOKEN = process.env.TAGTAPE_E2E_TOKEN ?? "";

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
		title: "Тест ✓ zoo",
		url: "https://youtu.be/jNQXAC9IVRw",
		kbps: 256,
		seconds: 19,
	},
	{
		title: "Flickermood",
		url: "https://soundcloud.com/forss/flickermood",
		kbps: 256,
		seconds: 213,
	},
	{
		title: "Bandcamp test",
		url: "https://youtube-dl.bandcamp.com/track/youtube-dl-test-song",
		kbps: 128,
		seconds: 10,
	},
];

describe.skipIf(!BASE)("end to end (real yt-dlp + ffmpeg, streamed)", () => {
	test("links + cover → streamed ZIP of tagged CBR MP3s", {
		timeout: 300_000,
	}, async () => {
		const headers = {
			authorization: `Bearer ${TOKEN}`,
			"content-type": "application/json",
		};
		const create = await fetch(`${BASE}/jobs`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				title: "E2E Album",
				artist: "Various",
				year: "2005",
				genre: "Test",
				coverUrl:
					"https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg",
				tracks: tracks.map(({ title, url }) => ({ title, url })),
			}),
		});
		expect(create.status).toBe(202);
		const { jobId } = (await create.json()) as { jobId: string };

		const snapshot = async () =>
			jobSnapshotSchema.parse(
				await (await fetch(`${BASE}/jobs/${jobId}`, { headers })).json(),
			);
		let current = await snapshot();
		while (current.status === "queued" || current.status === "probing") {
			await new Promise((resolve) => setTimeout(resolve, 500));
			current = await snapshot();
		}
		expect(current, JSON.stringify(current)).toMatchObject({
			status: "ready",
			downloadReady: true,
		});

		// The download *is* the conversion. No token: public by design.
		const started = Date.now();
		const archive = await fetch(`${BASE}/jobs/${jobId}/archive`);
		expect(archive.status).toBe(200);
		expect(archive.headers.get("content-length")).toBeNull();
		expect(archive.headers.get("content-disposition")).toContain(
			"filename*=UTF-8''Various%20-%20E2E%20Album.zip",
		);
		const zip = Buffer.from(await archive.arrayBuffer());
		const entries = readZip(zip);
		expect(entries.map((e) => [e.name, e.method])).toEqual([
			["01 - Тест ✓ zoo.mp3", 0],
			["02 - Flickermood.mp3", 0],
			["03 - Bandcamp test.mp3", 0],
		]);

		for (const [index, entry] of entries.entries()) {
			const expected = tracks[index] as (typeof tracks)[number];
			const { tag, audio } = splitTag(entry.data);

			const tags = NodeID3.read(tag);
			expect(tags).toMatchObject({
				title: expected.title,
				artist: "Various",
				performerInfo: "Various",
				album: "E2E Album",
				trackNumber: `${index + 1}/3`,
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

			// Our tag is the only one: audio starts straight with an MPEG frame,
			// with no Xing/Info header (wrong in a stream) and no second ID3 tag.
			expect(audio[0]).toBe(0xff);
			expect((audio[1] as number) & 0xe0).toBe(0xe0);
			expect(audio.subarray(0, 400).includes("Xing")).toBe(false);
			expect(audio.subarray(0, 400).includes("Info")).toBe(false);
			// No ID3v1 tag either (it would be the last 128 bytes, starting "TAG").
			// Searching all the audio for "ID3" would be wrong: those 3 bytes turn
			// up by chance in megabytes of compressed audio.
			expect(audio.subarray(-128, -125).toString("latin1")).not.toBe("TAG");
			expect(MP3_BITRATES[(audio[2] as number) >> 4]).toBe(expected.kbps);
			// CBR: duration follows from size and bitrate.
			const seconds = (audio.length * 8) / (expected.kbps * 1000);
			expect(Math.abs(seconds - expected.seconds)).toBeLessThan(2);
		}

		await new Promise((resolve) => setTimeout(resolve, 500));
		expect(await snapshot()).toMatchObject({
			status: "done",
			downloadReady: true,
		});
		console.info(`streamed ${zip.length} bytes in ${Date.now() - started} ms`);
	});
});
