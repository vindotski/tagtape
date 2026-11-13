import { describe, expect, test, vi } from "vitest";
import { emptyDraft, moveTrack, validateDraft } from "./album-draft";
import {
	type ApiConfig,
	apiConfigFromEnv,
	createJob,
	getJob,
	getSources,
	issuesToFieldErrors,
	streamArchive,
} from "./api.server";
import { cspPolicy } from "./csp.server";

const JOB_ID = "8f14e45f-ceea-4e7a-9f3b-1c2d3e4f5a6b";

function fakeApi(status: number, body: unknown) {
	const fetch = vi.fn(
		async (_url: string | URL | Request, _init?: RequestInit) =>
			new Response(JSON.stringify(body), { status }),
	);
	const config: ApiConfig = {
		apiUrl: "http://api.internal:4000",
		token: "secret-token",
		fetch: fetch as unknown as typeof globalThis.fetch,
	};
	return { fetch, config };
}

const album = {
	title: "Album",
	artist: "Artist",
	tracks: [{ title: "One", url: "https://music.example.com/t/01" }],
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
		draft.tracks = [{ key: "k", title: "T", url: "music.example.com/t/01" }];
		expect(validateDraft(draft)).toMatchObject({
			ok: true,
			input: {
				title: "A",
				artist: "B",
				tracks: [{ title: "T", url: "music.example.com/t/01" }],
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

test("the page CSP allows scripts only from us and with the page's nonce", () => {
	const policy = cspPolicy("abc123==");
	const scripts = policy
		.split("; ")
		.find((part) => part.startsWith("script-src"));
	expect(scripts).toBe("script-src 'self' 'nonce-abc123=='");
	expect(policy).toContain("frame-ancestors 'none'");
	expect(policy).toContain("object-src 'none'");
	expect(policy).toContain("connect-src 'self'");
});

describe("API client", () => {
	test("tells the API who the browser is", async () => {
		const { fetch, config } = fakeApi(202, { jobId: JOB_ID });
		await createJob(album, config, "203.0.113.7");
		expect(fetch).toHaveBeenCalledWith(
			"http://api.internal:4000/jobs",
			expect.objectContaining({
				headers: expect.objectContaining({ "x-tagtape-client": "203.0.113.7" }),
			}),
		);
	});

	test("lists the API's sources", async () => {
		const { fetch, config } = fakeApi(200, {
			sources: [{ id: "example", name: "Example Music" }],
		});
		expect(await getSources(config)).toEqual([
			{ id: "example", name: "Example Music" },
		]);
		expect(fetch).toHaveBeenCalledWith(
			"http://api.internal:4000/sources",
			expect.objectContaining({
				headers: expect.objectContaining({
					authorization: "Bearer secret-token",
				}),
			}),
		);
		await expect(getSources(fakeApi(500, {}).config)).rejects.toThrow("500");
	});

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
					message: "TagTape can't read tracks from this link.",
				},
			],
		});
		expect(await createJob(album, config)).toEqual({
			ok: false,
			message: "Some fields need attention.",
			fieldErrors: {
				"tracks.0.url": "TagTape can't read tracks from this link.",
			},
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
			downloadReady: true,
			createdAt: "2026-11-06T12:00:00.000Z",
			expiresAt: "2026-11-06T12:30:00.000Z",
		};
		const { config } = fakeApi(200, snapshot);
		expect(await getJob(JOB_ID, config)).toMatchObject({
			downloadUrl: `/download/${JOB_ID}`,
		});

		const pending = fakeApi(200, {
			...snapshot,
			status: "streaming",
			downloadReady: false,
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
			apiConfigFromEnv({ API_URL: "http://api:4000/", API_TOKEN: "t" }),
		).toEqual({ apiUrl: "http://api:4000", token: "t" });
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

describe("streamArchive (/download/:jobId)", () => {
	function archiveApi(response: () => Response) {
		const fetch = vi.fn(
			async (_url: string | URL | Request, _init?: RequestInit) => response(),
		);
		const config: ApiConfig = {
			apiUrl: "http://127.0.0.1:4000",
			token: "secret-token",
			fetch: fetch as unknown as typeof globalThis.fetch,
		};
		return { fetch, config };
	}

	test("streams the ZIP with its download headers, and nothing else", async () => {
		const { fetch, config } = archiveApi(
			() =>
				new Response("PKzipbytes", {
					status: 200,
					headers: {
						"content-type": "application/zip",
						"content-length": "10",
						"content-disposition": `attachment; filename="A - B.zip"`,
						"cache-control": "private, no-store",
						"x-internal": "do not leak",
					},
				}),
		);
		const response = await streamArchive(JOB_ID, config);

		expect(fetch.mock.calls[0]?.[0]).toBe(
			`http://127.0.0.1:4000/jobs/${JOB_ID}/archive`,
		);
		expect(response.status).toBe(200);
		expect(Object.fromEntries(response.headers)).toEqual({
			"content-type": "application/zip",
			"content-length": "10",
			"content-disposition": `attachment; filename="A - B.zip"`,
			"cache-control": "private, no-store",
		});
		expect(await response.text()).toBe("PKzipbytes");
	});

	test("expired or unknown jobs are 404", async () => {
		const { config } = archiveApi(() => new Response("{}", { status: 404 }));
		expect((await streamArchive(JOB_ID, config)).status).toBe(404);
	});

	test("an unreachable API is 502, not a crash", async () => {
		const config: ApiConfig = {
			apiUrl: "http://127.0.0.1:4000",
			token: "t",
			fetch: (async () => {
				throw new TypeError("fetch failed");
			}) as typeof globalThis.fetch,
		};
		expect((await streamArchive(JOB_ID, config)).status).toBe(502);
	});

	test("the browser leaving aborts the API request (stops the conversion)", async () => {
		const { fetch, config } = archiveApi(
			() =>
				new Response("PK", {
					status: 200,
					headers: { "content-type": "application/zip" },
				}),
		);
		const browser = new AbortController();
		await streamArchive(JOB_ID, config, browser.signal);
		const signal = fetch.mock.calls[0]?.[1]?.signal as AbortSignal;
		expect(signal.aborted).toBe(false);
		browser.abort();
		expect(signal.aborted).toBe(true);
	});

	test("already downloading (409) and busy (429) are passed on, not hidden", async () => {
		const busy = archiveApi(
			() =>
				new Response(
					JSON.stringify({ message: "TagTape is busy right now." }),
					{
						status: 429,
						headers: { "retry-after": "30" },
					},
				),
		);
		const response = await streamArchive(JOB_ID, busy.config);
		expect(response.status).toBe(429);
		expect(response.headers.get("retry-after")).toBe("30");
		expect(await response.text()).toBe("TagTape is busy right now.");

		const twice = archiveApi(
			() =>
				new Response(
					JSON.stringify({ message: "This album is already downloading" }),
					{
						status: 409,
					},
				),
		);
		expect((await streamArchive(JOB_ID, twice.config)).status).toBe(409);
	});

	test("downloaded too often (410) is passed on; errors are never cached", async () => {
		const gone = archiveApi(
			() =>
				new Response(
					JSON.stringify({
						message: "This album was downloaded too many times.",
					}),
					{ status: 410 },
				),
		);
		const response = await streamArchive(JOB_ID, gone.config);
		expect(response.status).toBe(410);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(await response.text()).toBe(
			"This album was downloaded too many times.",
		);

		const missing = archiveApi(() => new Response("{}", { status: 404 }));
		const notFound = await streamArchive(JOB_ID, missing.config);
		expect(notFound.status).toBe(404);
		expect(notFound.headers.get("cache-control")).toBe("no-store");
	});
});
