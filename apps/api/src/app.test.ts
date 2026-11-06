import NodeID3 from "node-id3";
import { afterEach, describe, expect, test } from "vitest";
import { UserFacingError } from "./lib/errors.ts";
import {
	album,
	auth,
	canonical,
	fakeMp3,
	fakePipeline,
	readZip,
	testApp,
} from "./test/helpers.ts";

type App = Awaited<ReturnType<typeof testApp>>["app"];
let app: App | undefined;
afterEach(async () => {
	await app?.close();
	app = undefined;
});

async function createJob(target: App, body: object = album()) {
	const response = await target.inject({
		method: "POST",
		url: "/jobs",
		headers: auth,
		payload: body,
	});
	return {
		response,
		jobId: (response.json() as { jobId?: string }).jobId as string,
	};
}

describe("auth", () => {
	test.each<[string, Record<string, string>]>([
		["no header", {}],
		["wrong token", { authorization: "Bearer nope" }],
		["wrong scheme", { authorization: "Basic dGVzdA==" }],
	])("rejects %s with 401", async (_label, headers) => {
		({ app } = await testApp());
		const response = await app.inject({
			method: "POST",
			url: "/jobs",
			headers,
			payload: album(),
		});
		expect(response.statusCode).toBe(401);
		expect(response.headers["www-authenticate"]).toBe("Bearer");
	});

	test("health and archive are public", async () => {
		({ app } = await testApp());
		const health = await app.inject("/health");
		expect(health.statusCode).toBe(200);
		expect(health.json()).toMatchObject({
			status: "ok",
			version: "dev",
			ytDlp: "2026.10.01",
		});

		const archive = await app.inject(
			"/jobs/8f14e45f-ceea-4e7a-9f3b-1c2d3e4f5a6b/archive",
		);
		expect(archive.statusCode).toBe(404);
	});

	test("health reports 503 when binaries are missing", async () => {
		const pipeline = fakePipeline();
		pipeline.versions = async () => {
			throw new Error("spawn ffmpeg ENOENT");
		};
		({ app } = await testApp({ pipeline }));
		expect((await app.inject("/health")).statusCode).toBe(503);
	});
});

describe("POST /jobs validation", () => {
	test("returns 400 with the failing field paths", async () => {
		({ app } = await testApp());
		const body = {
			...album(),
			year: "87",
			tracks: [{ title: "", url: "https://example.com/1" }],
		};
		const { response } = await createJob(app, body);
		expect(response.statusCode).toBe(400);
		const paths = (
			response.json() as { issues: Array<{ path: string }> }
		).issues.map((i) => i.path);
		expect(paths).toEqual(
			expect.arrayContaining(["/year", "/tracks/0/title", "/tracks/0/url"]),
		);
	});

	test("rejects a non-UUID job id on the public archive route", async () => {
		({ app } = await testApp());
		const response = await app.inject({
			url: "/jobs/..%2F..%2Fetc%2Fpasswd/archive",
		});
		expect(response.statusCode).toBe(400);
	});

	test("unknown routes need the token too (no route probing)", async () => {
		({ app } = await testApp());
		expect((await app.inject("/admin")).statusCode).toBe(401);
		expect(
			(await app.inject({ url: "/admin", headers: auth })).statusCode,
		).toBe(404);
	});
});

describe("job lifecycle", () => {
	const snapshot = async (target: App, id: string) =>
		(await target.inject({ url: `/jobs/${id}`, headers: auth })).json();

	test("checked → ready → the download streams the ZIP → done → download again", async () => {
		const ctx = await testApp();
		app = ctx.app;
		const { response, jobId } = await createJob(app);
		expect(response.statusCode).toBe(202);

		await app.jobs.settled();
		expect(await snapshot(app, jobId)).toMatchObject({
			id: jobId,
			status: "ready",
			downloadReady: true,
			tracks: [
				{ number: 1, title: "Track 1", status: "queued" },
				{ number: 2, title: "Track 2", status: "queued" },
			],
		});
		// Nothing is converted until someone downloads.
		expect(ctx.pipeline.streamed).toEqual([]);

		const archive = await app.inject(`/jobs/${jobId}/archive`);
		expect(archive.statusCode).toBe(200);
		expect(archive.headers["content-type"]).toBe("application/zip");
		expect(archive.headers["content-length"]).toBeUndefined();
		expect(archive.headers["content-disposition"]).toContain(
			"filename*=UTF-8''Rick%20Astley%20-%20Whenever%20You%20Need%20Somebody.zip",
		);

		const entries = readZip(archive.rawPayload);
		expect(entries.map((e) => [e.name, e.method])).toEqual([
			["01 - Track 1.mp3", 0],
			["02 - Track 2.mp3", 0],
		]);
		// Each entry is our ID3 tag followed by the streamed MP3 bytes, nothing else.
		const first = entries[0]?.data as Buffer;
		expect(first.subarray(0, 3).toString()).toBe("ID3");
		expect(NodeID3.read(first)).toMatchObject({
			title: "Track 1",
			artist: "Rick Astley",
			performerInfo: "Rick Astley",
			album: "Whenever You Need Somebody",
			trackNumber: "1/2",
			year: "1987",
			genre: "Pop",
		});
		expect(first.subarray(-fakeMp3(canonical(1)).length)).toEqual(
			fakeMp3(canonical(1)),
		);
		expect(ctx.pipeline.streamed).toEqual([canonical(1), canonical(2)]);

		await app.jobs.settled();
		expect(await snapshot(app, jobId)).toMatchObject({
			status: "done",
			downloadReady: true,
			tracks: [{ status: "done" }, { status: "done" }],
		});

		// Downloading again converts again (nothing was kept).
		expect((await app.inject(`/jobs/${jobId}/archive`)).statusCode).toBe(200);
		expect(ctx.pipeline.streamed).toHaveLength(4);
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
		({ app } = await testApp({ pipeline }));

		const { jobId } = await createJob(app, album(4));
		await app.jobs.settled();
		const result = await snapshot(app, jobId);

		expect(result).toMatchObject({ status: "failed", downloadReady: false });
		expect(result.tracks).toEqual([
			{
				number: 1,
				title: "Track 1",
				status: "error",
				error: "Longer than 2 hours (2:03:04)",
			},
			{
				number: 2,
				title: "Track 2",
				status: "error",
				error: "Live streams and premieres can't be converted",
			},
			{
				number: 3,
				title: "Track 3",
				status: "error",
				error: "This track is private",
			},
			{ number: 4, title: "Track 4", status: "queued" },
		]);
		expect((await app.inject(`/jobs/${jobId}/archive`)).statusCode).toBe(404);
		expect(pipeline.streamed).toEqual([]);
	});

	test("a track failing mid-download breaks the download and hides internals", async () => {
		const pipeline = fakePipeline();
		pipeline.failStreamOf = canonical(2);
		({ app } = await testApp({ pipeline }));

		const { jobId } = await createJob(app);
		await app.jobs.settled();
		// Over real HTTP, as a browser sees it: the body is cut off mid-transfer,
		// so the download fails instead of saving a complete-looking ZIP.
		const address = await app.listen({ port: 0, host: "127.0.0.1" });
		const response = await fetch(`${address}/jobs/${jobId}/archive`);
		expect(response.status).toBe(200);
		await expect(response.arrayBuffer()).rejects.toThrow();

		await app.jobs.settled();
		const result = await snapshot(app, jobId);
		expect(result).toMatchObject({
			status: "failed",
			error: "Track 2 failed: Couldn't convert this track",
			downloadReady: true, // the user can try again
		});
		expect(JSON.stringify(result)).not.toContain("ffmpeg exploded");
		// Track 3 never started; tracks after a failure don't run.
		expect(pipeline.streamed).toEqual([canonical(1), canonical(2)]);
	});

	test("the client leaving stops the conversion and the job is ready again", async () => {
		const pipeline = fakePipeline();
		pipeline.holdStreams = true;
		({ app } = await testApp({ pipeline }));
		const { jobId } = await createJob(app);
		await app.jobs.settled();

		const address = await app.listen({ port: 0, host: "127.0.0.1" });
		const client = new AbortController();
		const response = await fetch(`${address}/jobs/${jobId}/archive`, {
			signal: client.signal,
		});
		expect(response.status).toBe(200);
		const reader = (response.body as ReadableStream<Uint8Array>).getReader();
		await reader.read(); // first bytes arrive while track 1 is converting
		expect((await snapshot(app, jobId)).status).toBe("streaming");

		client.abort();
		await expect.poll(() => pipeline.aborted).toEqual([canonical(1)]);
		await app.jobs.settled();
		expect(await snapshot(app, jobId)).toMatchObject({
			status: "ready",
			downloadReady: true,
			tracks: [{ status: "queued" }, { status: "queued" }],
		});
		expect(pipeline.streamed).toEqual([canonical(1)]);
	});

	test("one download per album at a time (409); 429 when downloads are full", async () => {
		const pipeline = fakePipeline();
		pipeline.holdStreams = true;
		({ app } = await testApp({
			pipeline,
			config: { MAX_ACTIVE_STREAMS: 1, MAX_QUEUED_STREAMS: 0 },
		}));
		const first = (await createJob(app)).jobId;
		const second = (await createJob(app)).jobId;
		await app.jobs.settled();

		const address = await app.listen({ port: 0, host: "127.0.0.1" });
		const client = new AbortController();
		const running = await fetch(`${address}/jobs/${first}/archive`, {
			signal: client.signal,
		});
		expect(running.status).toBe(200);

		expect((await app.inject(`/jobs/${first}/archive`)).statusCode).toBe(409);
		const full = await app.inject(`/jobs/${second}/archive`);
		expect(full.statusCode).toBe(429);
		expect(full.headers["retry-after"]).toBe("30");

		client.abort();
		await app.jobs.settled();
	});

	test("expired jobs return 404", async () => {
		let clock = new Date("2026-11-06T12:00:00Z");
		({ app } = await testApp({
			config: { JOB_TTL_MIN: 30 },
			now: () => clock,
		}));
		const { jobId } = await createJob(app);
		await app.jobs.settled();

		clock = new Date("2026-11-06T12:29:00Z");
		expect(app.jobs.sweep()).toBe(0);
		clock = new Date("2026-11-06T12:31:00Z");
		expect(app.jobs.sweep()).toBe(1);

		expect(
			(await app.inject({ url: `/jobs/${jobId}`, headers: auth })).statusCode,
		).toBe(404);
		expect((await app.inject(`/jobs/${jobId}/archive`)).statusCode).toBe(404);
	});

	test("answers 429 when the check queue is full", async () => {
		const pipeline = fakePipeline();
		let open = () => {};
		pipeline.gate = new Promise<void>((resolve) => {
			open = resolve;
		});
		({ app } = await testApp({
			pipeline,
			config: { MAX_ACTIVE_PROBES: 1, MAX_QUEUED_JOBS: 1 },
		}));

		expect((await createJob(app)).response.statusCode).toBe(202); // checking
		expect((await createJob(app)).response.statusCode).toBe(202); // queued
		const full = (await createJob(app)).response;
		expect(full.statusCode).toBe(429);
		expect(full.headers["retry-after"]).toBe("60");

		open();
		await app.jobs.settled();
		expect((await createJob(app)).response.statusCode).toBe(202);
	});
});
