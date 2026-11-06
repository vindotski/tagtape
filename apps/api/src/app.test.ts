import { afterEach, describe, expect, test } from "vitest";
import { UserFacingError } from "./lib/errors.ts";
import {
	album,
	auth,
	canonical,
	fakePipeline,
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
			tracks: [{ title: "", url: "https://vimeo.com/1" }],
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
	test("202 → polled snapshot reaches done → ZIP downloads", async () => {
		const ctx = await testApp();
		app = ctx.app;
		const { response, jobId } = await createJob(app);
		expect(response.statusCode).toBe(202);

		await app.jobs.settled();
		const snapshot = await app.inject({ url: `/jobs/${jobId}`, headers: auth });
		expect(snapshot.statusCode).toBe(200);
		expect(snapshot.json()).toMatchObject({
			id: jobId,
			status: "done",
			archiveReady: true,
			tracks: [
				{ number: 1, title: "Track 1", status: "done" },
				{ number: 2, title: "Track 2", status: "done" },
			],
		});

		// Tags got the album metadata and "n/total" numbering.
		expect(ctx.pipeline.tagged.map((t) => t.tags)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					title: "Track 1",
					artist: "Rick Astley",
					album: "Whenever You Need Somebody",
					trackNumber: 1,
					trackTotal: 2,
					year: "1987",
					genre: "Pop",
				}),
			]),
		);

		const archive = await app.inject(`/jobs/${jobId}/archive`);
		expect(archive.statusCode).toBe(200);
		expect(archive.headers["content-type"]).toBe("application/zip");
		expect(archive.headers["content-disposition"]).toContain(
			"filename*=UTF-8''Rick%20Astley%20-%20Whenever%20You%20Need%20Somebody.zip",
		);
		const zip = archive.rawPayload;
		expect(zip.subarray(0, 2).toString()).toBe("PK");
		expect(zip.includes("01 - Track 1.mp3")).toBe(true);
		expect(zip.includes("02 - Track 2.mp3")).toBe(true);
	});

	test("too-long, live and unavailable tracks fail the job before downloading", async () => {
		const pipeline = fakePipeline();
		pipeline.probes.set(canonical(1), {
			title: "",
			durationSeconds: 754,
			isLive: false,
		});
		pipeline.probes.set(canonical(2), {
			title: "",
			durationSeconds: null,
			isLive: true,
		});
		pipeline.probes.set(
			canonical(3),
			new UserFacingError("This video is private"),
		);
		({ app } = await testApp({ pipeline }));

		const { jobId } = await createJob(app, album(4));
		await app.jobs.settled();
		const snapshot = (
			await app.inject({ url: `/jobs/${jobId}`, headers: auth })
		).json();

		expect(snapshot).toMatchObject({ status: "failed", archiveReady: false });
		expect(snapshot.tracks).toEqual([
			{
				number: 1,
				title: "Track 1",
				status: "error",
				error: "Longer than 10 minutes (12:34)",
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
				error: "This video is private",
			},
			{ number: 4, title: "Track 4", status: "queued" },
		]);
		expect(pipeline.tagged).toEqual([]);
	});

	test("unexpected errors are hidden from users", async () => {
		const pipeline = fakePipeline();
		pipeline.failDownloadOf = canonical(2);
		({ app } = await testApp({ pipeline }));

		const { jobId } = await createJob(app);
		await app.jobs.settled();
		const snapshot = (
			await app.inject({ url: `/jobs/${jobId}`, headers: auth })
		).json();

		expect(snapshot.status).toBe("failed");
		expect(snapshot.error).toBe("Track 2 failed: Couldn't process this track");
		expect(JSON.stringify(snapshot)).not.toContain("ffmpeg exploded");
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
		expect(await app.jobs.sweep()).toBe(0);
		clock = new Date("2026-11-06T12:31:00Z");
		expect(await app.jobs.sweep()).toBe(1);

		expect(
			(await app.inject({ url: `/jobs/${jobId}`, headers: auth })).statusCode,
		).toBe(404);
		expect((await app.inject(`/jobs/${jobId}/archive`)).statusCode).toBe(404);
	});

	test("answers 429 when the queue is full", async () => {
		const pipeline = fakePipeline();
		let open = () => {};
		pipeline.gate = new Promise<void>((resolve) => {
			open = resolve;
		});
		({ app } = await testApp({
			pipeline,
			config: { MAX_ACTIVE_JOBS: 1, MAX_QUEUED_JOBS: 1 },
		}));

		expect((await createJob(app)).response.statusCode).toBe(202); // running
		expect((await createJob(app)).response.statusCode).toBe(202); // queued
		const full = (await createJob(app)).response;
		expect(full.statusCode).toBe(429);
		expect(full.headers["retry-after"]).toBe("60");

		open();
		await app.jobs.settled();
		expect((await createJob(app)).response.statusCode).toBe(202);
	});
});
