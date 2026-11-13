import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import NodeID3 from "node-id3";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { TagTape } from "./index.ts";
import { UserFacingError } from "./lib/errors.ts";
import {
	album,
	canonical,
	fakeMp3,
	fakePipeline,
	testTagTape,
} from "./test/helpers.ts";

let open: TagTape | undefined;
let destination: string;
beforeEach(async () => {
	destination = await mkdtemp(join(tmpdir(), "tagtape-job-"));
});
afterEach(async () => {
	await open?.close();
	open = undefined;
	await rm(destination, { recursive: true, force: true });
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
			tagtape.createJob(
				{
					title: "",
					artist: "A",
					tracks: [{ title: "T", url: "" }],
				},
				destination,
			),
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
		expect(tagtape.createJob(input, destination)).toEqual({
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
	test("checked, then saved as a folder of tagged MP3s", async () => {
		const { tagtape, pipeline } = start();
		const id = jobId(tagtape.createJob(album(), destination));
		expect(tagtape.busy()).toBe(true);
		await tagtape.jobs.settled();

		const folder = join(destination, "The Examples - Night Drive");
		expect(tagtape.getJob(id)).toMatchObject({
			id,
			status: "done",
			folder,
			tracks: [
				{ number: 1, title: "Track 1", status: "done" },
				{ number: 2, title: "Track 2", status: "done" },
			],
		});
		expect(tagtape.busy()).toBe(false);
		expect(await readdir(folder)).toEqual([
			"01 - Track 1.mp3",
			"02 - Track 2.mp3",
		]);
		// Each file is our ID3 tag followed by the streamed MP3 bytes, nothing else.
		const first = await readFile(join(folder, "01 - Track 1.mp3"));
		expect(NodeID3.read(first)).toMatchObject({
			title: "Track 1",
			artist: "The Examples",
			performerInfo: "The Examples",
			album: "Night Drive",
			trackNumber: "1/2",
			year: "2026",
			genre: "Synthwave",
		});
		expect(first.subarray(-fakeMp3(canonical(1)).length)).toEqual(
			fakeMp3(canonical(1)),
		);
		expect(pipeline.streamed).toEqual([canonical(1), canonical(2)]);
	});

	test("making the same album again gets its own folder", async () => {
		const { tagtape } = start();
		tagtape.createJob(album(), destination);
		await tagtape.jobs.settled();
		const id = jobId(tagtape.createJob(album(), destination));
		await tagtape.jobs.settled();
		expect(tagtape.getJob(id)?.folder).toBe(
			join(destination, "The Examples - Night Drive (2)"),
		);
	});

	test("too-long, live and unavailable tracks fail the check; nothing is written", async () => {
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
		const id = jobId(tagtape.createJob(album(4), destination));
		await tagtape.jobs.settled();

		const snapshot = tagtape.getJob(id);
		expect(snapshot).toMatchObject({
			status: "failed",
			error: "Some tracks can't be used. Fix or remove them and try again.",
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
		expect(snapshot?.folder).toBeUndefined();
		expect(pipeline.streamed).toEqual([]);
		expect(await readdir(destination)).toEqual([]);
	});

	test("a track failing while saving removes the whole album and hides internals", async () => {
		const pipeline = fakePipeline();
		pipeline.failStreamOf = canonical(2);
		const { tagtape } = start({ pipeline });
		const id = jobId(tagtape.createJob(album(3), destination));
		await tagtape.jobs.settled();

		const snapshot = tagtape.getJob(id);
		expect(snapshot).toMatchObject({
			status: "failed",
			error: "Track 2 failed: Couldn't convert this track",
			tracks: [{ status: "done" }, { status: "error" }, { status: "queued" }],
		});
		expect(JSON.stringify(snapshot)).not.toContain("ffmpeg exploded");
		expect(pipeline.streamed).toEqual([canonical(1), canonical(2)]);
		expect(await readdir(destination)).toEqual([]);
	});

	test("cancelling while saving stops the source and leaves nothing behind", async () => {
		const pipeline = fakePipeline();
		pipeline.holdStreams = true;
		const { tagtape } = start({ pipeline });
		const id = jobId(tagtape.createJob(album(), destination));
		await expect.poll(() => pipeline.streamed).toEqual([canonical(1)]);
		expect(tagtape.getJob(id)).toMatchObject({ status: "streaming" });

		expect(tagtape.cancelJob(id)).toBe(true);
		await tagtape.jobs.settled();
		expect(tagtape.getJob(id)).toMatchObject({
			status: "failed",
			error: "Cancelled",
		});
		expect(pipeline.aborted).toEqual([canonical(1)]);
		expect(await readdir(destination)).toEqual([]);
		// Nothing left to cancel.
		expect(tagtape.cancelJob(id)).toBe(false);
	});

	test("cancelling during the check fails the job before anything is written", async () => {
		const pipeline = fakePipeline();
		pipeline.gate = new Promise(() => {});
		const { tagtape } = start({ pipeline });
		const id = jobId(tagtape.createJob(album(), destination));
		await expect.poll(() => tagtape.getJob(id)?.status).toBe("probing");
		tagtape.cancelJob(id);
		await tagtape.jobs.settled();
		expect(tagtape.getJob(id)).toMatchObject({
			status: "failed",
			error: "Cancelled",
		});
		expect(pipeline.streamed).toEqual([]);
	});

	test("closing cancels running jobs and cleans up", async () => {
		const pipeline = fakePipeline();
		pipeline.holdStreams = true;
		const { tagtape } = start({ pipeline });
		tagtape.createJob(album(), destination);
		await expect.poll(() => pipeline.streamed).toHaveLength(1);
		await tagtape.close();
		expect(await readdir(destination)).toEqual([]);
	});

	test("finished jobs are forgotten after a while; unknown jobs are undefined", async () => {
		let now = new Date("2026-11-13T10:00:00Z");
		const { tagtape } = start({ now: () => now });
		const id = jobId(tagtape.createJob(album(), destination));
		await tagtape.jobs.settled();
		now = new Date("2026-11-13T10:29:00Z");
		expect(tagtape.jobs.sweep()).toBe(0);
		now = new Date("2026-11-13T10:31:00Z");
		expect(tagtape.jobs.sweep()).toBe(1);
		expect(tagtape.getJob(id)).toBeUndefined();
	});
});
