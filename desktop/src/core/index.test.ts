import { buffer } from "node:stream/consumers";
import NodeID3 from "node-id3";
import { afterEach, describe, expect, test } from "vitest";
import type { TagTape } from "./index.ts";
import { UserFacingError } from "./lib/errors.ts";
import {
	album,
	canonical,
	fakeMp3,
	fakePipeline,
	readZip,
	testTagTape,
} from "./test/helpers.ts";

let open: TagTape | undefined;
afterEach(async () => {
	await open?.close();
	open = undefined;
});

function start(options: Parameters<typeof testTagTape>[0] = {}) {
	const made = testTagTape(options);
	open = made.tagtape;
	return made;
}

function jobId(outcome: ReturnType<TagTape["createJob"]>): string {
	if (outcome.kind !== "ok") throw new Error(`Not created: ${outcome.kind}`);
	return outcome.jobId;
}

describe("creating a job", () => {
	test("lists the sources", () => {
		const { tagtape } = start();
		expect(tagtape.sources()).toEqual([
			{ id: "example", name: "Example Music" },
		]);
	});

	test("invalid albums come back with the form's field paths", () => {
		const { tagtape } = start();
		expect(
			tagtape.createJob({
				title: "",
				artist: "A",
				tracks: [{ title: "T", url: "" }],
			}),
		).toMatchObject({
			kind: "invalid",
			issues: expect.arrayContaining([
				expect.objectContaining({ path: "title" }),
				expect.objectContaining({ path: "tracks.0.url" }),
			]),
		});
	});

	test("a link no source handles is a field error on that track", () => {
		const { tagtape } = start();
		const input = album();
		input.tracks[1] = {
			title: "Other",
			url: "https://elsewhere.example.org/x",
		};
		expect(tagtape.createJob(input)).toEqual({
			kind: "invalid",
			issues: [
				{
					path: "tracks.1.url",
					message: "TagTape can't read tracks from this link",
				},
			],
		});
	});
});

describe("job lifecycle", () => {
	test("checked → ready → the ZIP streams → done", async () => {
		const { tagtape, pipeline } = start();
		const id = jobId(tagtape.createJob(album()));
		await tagtape.jobs.settled();
		expect(tagtape.getJob(id)).toMatchObject({
			id,
			status: "ready",
			downloadReady: true,
			tracks: [
				{ number: 1, title: "Track 1", status: "queued" },
				{ number: 2, title: "Track 2", status: "queued" },
			],
		});
		// Nothing is converted until the album is asked for.
		expect(pipeline.streamed).toEqual([]);

		const opened = await tagtape.openStream(id, new AbortController().signal);
		if (opened.kind !== "ok") throw new Error(opened.message);
		expect(opened.fileName).toBe("The Examples - Night Drive.zip");
		const entries = readZip(await buffer(opened.stream));
		expect(entries.map((entry) => entry.name)).toEqual([
			"01 - Track 1.mp3",
			"02 - Track 2.mp3",
		]);
		// Each entry is our ID3 tag followed by the streamed MP3 bytes, nothing else.
		const first = entries[0]?.data as Buffer;
		expect(NodeID3.read(first)).toMatchObject({
			title: "Track 1",
			artist: "The Examples",
			album: "Night Drive",
			trackNumber: "1/2",
		});
		expect(first.subarray(-fakeMp3(canonical(1)).length)).toEqual(
			fakeMp3(canonical(1)),
		);

		await tagtape.jobs.settled();
		expect(tagtape.getJob(id)).toMatchObject({
			status: "done",
			tracks: [{ status: "done" }, { status: "done" }],
		});
	});

	test("too-long, live and unavailable tracks fail the check; nothing streams", async () => {
		const pipeline = fakePipeline();
		pipeline.probes.set(canonical(1), {
			title: "",
			durationSeconds: 7384,
			isLive: false,
		});
		pipeline.probes.set(canonical(2), {
			title: "",
			durationSeconds: null,
			isLive: true,
		});
		pipeline.probes.set(
			canonical(3),
			new UserFacingError("This track is private"),
		);
		const { tagtape } = start({ pipeline });
		const id = jobId(tagtape.createJob(album(4)));
		await tagtape.jobs.settled();

		expect(tagtape.getJob(id)).toMatchObject({
			status: "failed",
			downloadReady: false,
			tracks: [
				{ status: "error", error: "Longer than 2 hours (2:03:04)" },
				{
					status: "error",
					error: "Live streams and premieres can't be converted",
				},
				{ status: "error", error: "This track is private" },
				{ status: "queued" },
			],
		});
		expect(
			await tagtape.openStream(id, new AbortController().signal),
		).toMatchObject({ kind: "unavailable" });
		expect(pipeline.streamed).toEqual([]);
	});

	test("an unexpected failure hides internals", async () => {
		const pipeline = fakePipeline();
		pipeline.failStreamOf = canonical(2);
		const { tagtape } = start({ pipeline });
		const id = jobId(tagtape.createJob(album()));
		await tagtape.jobs.settled();
		const opened = await tagtape.openStream(id, new AbortController().signal);
		if (opened.kind !== "ok") throw new Error(opened.message);
		await expect(buffer(opened.stream)).rejects.toThrow();
		await tagtape.jobs.settled();
		const snapshot = tagtape.getJob(id);
		expect(snapshot).toMatchObject({
			status: "failed",
			error: "Track 2 failed: Couldn't convert this track",
		});
		expect(JSON.stringify(snapshot)).not.toContain("ffmpeg exploded");
	});

	test("unknown jobs are undefined", () => {
		const { tagtape } = start();
		expect(
			tagtape.getJob("00000000-0000-4000-8000-000000000000"),
		).toBeUndefined();
	});
});
