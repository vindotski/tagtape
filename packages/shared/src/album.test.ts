import { describe, expect, test } from "vitest";
import { type AlbumInput, albumInputSchema } from "./album.ts";
import { jobSnapshotSchema } from "./jobs.ts";
import { MAX_TRACKS } from "./limits.ts";

const track = (n: number) => ({
	title: `Track ${n}`,
	url: `https://youtu.be/dQw4w9WgX${String(n).padStart(2, "0")}`,
});

const valid: AlbumInput = {
	title: "  Whenever You Need Somebody ",
	artist: "Rick Astley",
	genre: "",
	year: "1987",
	coverUrl: "",
	tracks: [track(1)],
};

/** Paths of the fields that failed validation, e.g. `["tracks", 0, "url"]`. */
const errorPaths = (input: unknown) => {
	const result = albumInputSchema.safeParse(input);
	return result.success ? [] : result.error.issues.map((issue) => issue.path);
};

describe("albumInputSchema", () => {
	test("normalises a valid album", () => {
		expect(albumInputSchema.parse(valid)).toEqual({
			title: "Whenever You Need Somebody",
			artist: "Rick Astley",
			genre: undefined,
			year: "1987",
			coverUrl: undefined,
			tracks: [
				{
					title: "Track 1",
					url: "https://www.youtube.com/watch?v=dQw4w9WgX01",
				},
			],
		});
	});

	test("optional fields may be omitted entirely", () => {
		const { genre, year, coverUrl, ...required } = valid;
		expect(albumInputSchema.safeParse(required).success).toBe(true);
	});

	test.each([
		["blank title", { title: "   " }, ["title"]],
		["title over 60", { title: "x".repeat(61) }, ["title"]],
		["missing artist", { artist: "" }, ["artist"]],
		["genre over 30", { genre: "x".repeat(31) }, ["genre"]],
		["two-digit year", { year: "87" }, ["year"]],
		["cover not a url", { coverUrl: "cover.jpg" }, ["coverUrl"]],
		["cover with ftp", { coverUrl: "ftp://example.com/a.jpg" }, ["coverUrl"]],
		["no tracks", { tracks: [] }, ["tracks"]],
	])("rejects %s", (_label, override, path) => {
		expect(errorPaths({ ...valid, ...override })).toEqual([path]);
	});

	test(`accepts ${MAX_TRACKS} tracks but not ${MAX_TRACKS + 1}`, () => {
		const tracks = (count: number) =>
			Array.from({ length: count }, (_, i) => track(i + 1));
		expect(errorPaths({ ...valid, tracks: tracks(MAX_TRACKS) })).toEqual([]);
		expect(errorPaths({ ...valid, tracks: tracks(MAX_TRACKS + 1) })).toEqual([
			["tracks"],
		]);
	});

	test("reports the failing track field", () => {
		const tracks = [track(1), { title: "", url: "https://example.com/123" }];
		expect(errorPaths({ ...valid, tracks })).toEqual([
			["tracks", 1, "title"],
			["tracks", 1, "url"],
		]);
	});
});

describe("jobSnapshotSchema", () => {
	test("accepts a snapshot as the API sends it", () => {
		const snapshot = {
			id: "8f14e45f-ceea-4e7a-9f3b-1c2d3e4f5a6b",
			status: "processing",
			tracks: [
				{ number: 1, title: "Track 1", status: "done" },
				{
					number: 2,
					title: "Track 2",
					status: "error",
					error: "Video unavailable",
				},
			],
			archiveReady: false,
			createdAt: "2026-11-06T12:00:00.000Z",
			expiresAt: "2026-11-06T12:30:00.000Z",
		};
		expect(jobSnapshotSchema.parse(snapshot)).toEqual(snapshot);
	});
});
