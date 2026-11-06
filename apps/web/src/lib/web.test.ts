import { describe, expect, test, vi } from "vitest";
import { emptyDraft, moveTrack, validateDraft } from "./album-draft";
import {
	type ApiConfig,
	apiConfigFromEnv,
	createJob,
	getJob,
	issuesToFieldErrors,
} from "./api.server";

const JOB_ID = "8f14e45f-ceea-4e7a-9f3b-1c2d3e4f5a6b";

function fakeApi(status: number, body: unknown) {
	const fetch = vi.fn(
		async (_url: string | URL | Request, _init?: RequestInit) =>
			new Response(JSON.stringify(body), { status }),
	);
	const config: ApiConfig = {
		apiUrl: "http://api.internal:4000",
		token: "secret-token",
		publicUrl: "https://api.tagtape.app",
		fetch: fetch as unknown as typeof globalThis.fetch,
	};
	return { fetch, config };
}

const album = {
	title: "Album",
	artist: "Artist",
	tracks: [{ title: "One", url: "https://youtu.be/dQw4w9WgXcQ" }],
};

describe("album draft", () => {
	test("validation errors are keyed like the form fields", () => {
		const draft = emptyDraft();
		const result = validateDraft(draft);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(Object.keys(result.errors)).toEqual(
				expect.arrayContaining([
					"title",
					"artist",
					"tracks.0.title",
					"tracks.0.url",
				]),
			);
		}
	});

	test("a filled-in draft becomes the API input", () => {
		const draft = { ...emptyDraft(), title: "A", artist: "B" };
		draft.tracks = [{ key: "k", title: "T", url: "youtu.be/dQw4w9WgXcQ" }];
		expect(validateDraft(draft)).toMatchObject({
			ok: true,
			input: {
				title: "A",
				artist: "B",
				tracks: [{ title: "T", url: "youtu.be/dQw4w9WgXcQ" }],
			},
		});
	});

	test("moveTrack reorders without mutating", () => {
		const tracks = ["a", "b", "c"].map((key) => ({ key, title: key, url: "" }));
		expect(moveTrack(tracks, 0, 2).map((t) => t.key)).toEqual(["b", "c", "a"]);
		expect(moveTrack(tracks, 0, -1)).toBe(tracks);
		expect(tracks.map((t) => t.key)).toEqual(["a", "b", "c"]);
	});
});

describe("API client", () => {
	test("sends the bearer token and returns the job id", async () => {
		const { fetch, config } = fakeApi(202, { jobId: JOB_ID });
		expect(await createJob(album, config)).toEqual({ ok: true, jobId: JOB_ID });
		const [url, init] = fetch.mock.calls[0] ?? [];
		expect(url).toBe("http://api.internal:4000/jobs");
		expect(init?.headers).toMatchObject({
			authorization: "Bearer secret-token",
		});
	});

	test("maps 400 issues to form field errors", async () => {
		const { config } = fakeApi(400, {
			issues: [
				{
					path: "/tracks/0/url",
					message: "Enter a link to a single YouTube video",
				},
			],
		});
		expect(await createJob(album, config)).toEqual({
			ok: false,
			message: "Some fields need attention.",
			fieldErrors: { "tracks.0.url": "Enter a link to a single YouTube video" },
		});
	});

	test("passes the busy message through on 429", async () => {
		const { config } = fakeApi(429, { message: "TagTape is busy right now." });
		expect(await createJob(album, config)).toEqual({
			ok: false,
			message: "TagTape is busy right now.",
		});
	});

	test("an unreachable API becomes a friendly message, not a crash", async () => {
		const config: ApiConfig = {
			...fakeApi(200, {}).config,
			fetch: (async () => {
				throw new TypeError("fetch failed");
			}) as typeof globalThis.fetch,
		};
		expect(await createJob(album, config)).toMatchObject({ ok: false });
	});

	test("adds the public download URL only when the ZIP is ready", async () => {
		const snapshot = {
			id: JOB_ID,
			status: "done",
			tracks: [{ number: 1, title: "One", status: "done" }],
			archiveReady: true,
			createdAt: "2026-11-06T12:00:00.000Z",
			expiresAt: "2026-11-06T12:30:00.000Z",
		};
		const { config } = fakeApi(200, snapshot);
		expect(await getJob(JOB_ID, config)).toMatchObject({
			downloadUrl: `https://api.tagtape.app/jobs/${JOB_ID}/archive`,
		});

		const pending = fakeApi(200, {
			...snapshot,
			status: "processing",
			archiveReady: false,
		});
		expect(await getJob(JOB_ID, pending.config)).not.toHaveProperty(
			"downloadUrl",
		);
	});

	test("404 means the job is gone", async () => {
		expect(await getJob(JOB_ID, fakeApi(404, {}).config)).toBeNull();
	});

	test("config comes from env and requires the token", () => {
		expect(() => apiConfigFromEnv({ API_URL: "http://x" })).toThrow(
			"API_TOKEN",
		);
		expect(
			apiConfigFromEnv({
				API_URL: "http://api:4000/",
				API_TOKEN: "t",
				PUBLIC_API_URL: "https://dl/",
			}),
		).toEqual({
			apiUrl: "http://api:4000",
			token: "t",
			publicUrl: "https://dl",
		});
	});

	test("issue paths become dotted keys, first message wins", () => {
		expect(
			issuesToFieldErrors([
				{ path: "/title", message: "A" },
				{ path: "/title", message: "B" },
				{ path: "/tracks/2/title", message: "C" },
			]),
		).toEqual({ title: "A", "tracks.2.title": "C" });
	});
});
