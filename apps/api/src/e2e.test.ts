/**
 * Opt-in end-to-end test against a running API with the real yt-dlp and ffmpeg,
 * e.g. the Docker image:
 *
 *   docker run -d -p 127.0.0.1:4100:4000 -e API_TOKEN=$TOKEN tagtape-api
 *   TAGTAPE_E2E_URL=http://127.0.0.1:4100 TAGTAPE_E2E_TOKEN=$TOKEN \
 *     pnpm --filter @tagtape/api exec vitest run src/e2e.test.ts
 *
 * Downloads "Me at the zoo" (19 s, the first YouTube upload), chosen for stability; needs the network.
 * (yt-dlp's own test video BaW_jenozKc has been taken down.)
 */
import { jobSnapshotSchema } from "@tagtape/shared";
import NodeID3 from "node-id3";
import sharp from "sharp";
import { describe, expect, test } from "vitest";

const BASE = process.env.TAGTAPE_E2E_URL;
const TOKEN = process.env.TAGTAPE_E2E_TOKEN ?? "";

/** Reads a ZIP whose entries are stored (uncompressed), via the central directory. */
function readStoredZip(zip: Buffer): Map<string, Buffer> {
	const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
	const count = zip.readUInt16LE(eocd + 10);
	let offset = zip.readUInt32LE(eocd + 16);
	const entries = new Map<string, Buffer>();
	for (let i = 0; i < count; i++) {
		const method = zip.readUInt16LE(offset + 10);
		const size = zip.readUInt32LE(offset + 20);
		const nameLength = zip.readUInt16LE(offset + 28);
		const extraLength = zip.readUInt16LE(offset + 30);
		const commentLength = zip.readUInt16LE(offset + 32);
		const localOffset = zip.readUInt32LE(offset + 42);
		const name = zip.toString("utf8", offset + 46, offset + 46 + nameLength);
		expect(method, `${name} should be stored`).toBe(0);
		const dataStart =
			localOffset +
			30 +
			zip.readUInt16LE(localOffset + 26) +
			zip.readUInt16LE(localOffset + 28);
		entries.set(name, zip.subarray(dataStart, dataStart + size));
		offset += 46 + nameLength + extraLength + commentLength;
	}
	return entries;
}

describe.skipIf(!BASE)("end to end (real yt-dlp + ffmpeg)", () => {
	test("YouTube link + cover → ZIP with a tagged MP3", {
		timeout: 180_000,
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
				artist: "Jawed Karim",
				year: "2005",
				genre: "Test",
				coverUrl:
					"https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg",
				tracks: [
					{ title: "Тест ✓ test video", url: "https://youtu.be/jNQXAC9IVRw" },
				],
			}),
		});
		expect(create.status).toBe(202);
		const { jobId } = (await create.json()) as { jobId: string };

		let snapshot = jobSnapshotSchema.parse(
			await (await fetch(`${BASE}/jobs/${jobId}`, { headers })).json(),
		);
		const seen = new Set([snapshot.status]);
		while (snapshot.status !== "done" && snapshot.status !== "failed") {
			await new Promise((resolve) => setTimeout(resolve, 1000));
			snapshot = jobSnapshotSchema.parse(
				await (await fetch(`${BASE}/jobs/${jobId}`, { headers })).json(),
			);
			seen.add(snapshot.status);
		}
		expect(snapshot, JSON.stringify(snapshot)).toMatchObject({
			status: "done",
			archiveReady: true,
		});

		// No token: the archive is public by design.
		const archive = await fetch(`${BASE}/jobs/${jobId}/archive`);
		expect(archive.status).toBe(200);
		expect(archive.headers.get("content-disposition")).toContain(
			"filename*=UTF-8''Jawed%20Karim%20-%20E2E%20Album.zip",
		);
		const files = readStoredZip(Buffer.from(await archive.arrayBuffer()));
		expect([...files.keys()]).toEqual(["01 - Тест ✓ test video.mp3"]);

		const mp3 = files.get("01 - Тест ✓ test video.mp3") as Buffer;
		const tags = NodeID3.read(mp3);
		expect(tags).toMatchObject({
			title: "Тест ✓ test video",
			artist: "Jawed Karim",
			performerInfo: "Jawed Karim",
			album: "E2E Album",
			trackNumber: "1/1",
			year: "2005",
			genre: "Test",
		});
		const image = tags.image as { type: { id: number }; imageBuffer: Buffer };
		expect(image.type.id).toBe(3);
		const cover = await sharp(image.imageBuffer).metadata();
		expect(cover).toMatchObject({ format: "jpeg", width: 1000, height: 1000 });

		// Real MPEG audio follows the tag: an MPEG frame sync (11 set bits).
		const audio = mp3.subarray(10 + mp3.readUInt32BE(6));
		expect(audio.length).toBeGreaterThan(10_000);
		console.info(
			`statuses seen: ${[...seen].join(" → ")}; mp3 ${mp3.length} bytes`,
		);
	});
});
