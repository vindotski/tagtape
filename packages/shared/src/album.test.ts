import { describe, expect, test } from "vitest";
import { type AlbumInput, albumInputSchema } from "./album.ts";
import { MAX_TRACKS } from "./limits.ts";

const track = (n: number) => ({
	title: `Track ${n}`,
	url: `music.example.com/tracks/${n}.mp3`,
});

const valid: AlbumInput = {
	title: "  Night Drive ",
	artist: "The Examples",
	genre: "",
	year: "2026",
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
			title: "Night Drive",
			artist: "The Examples",
			genre: undefined,
			year: "2026",
			coverUrl: undefined,
			tracks: [
				{
					title: "Track 1",
					// Only normalised: the pipeline's sources canonicalise links.
					url: "https://music.example.com/tracks/1.mp3",
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
		["cover not a url", { coverUrl: "my cover" }, ["coverUrl"]],
		["cover with ftp", { coverUrl: "ftp://example.com/a.jpg" }, ["coverUrl"]],
		[
			"cover with a port",
			{ coverUrl: "https://example.com:8443/a.jpg" },
			["coverUrl"],
		],
		[
			"cover with credentials",
			{ coverUrl: "https://u:p@example.com/a.jpg" },
			["coverUrl"],
		],
		[
			"a link over 2048 characters",
			{ coverUrl: `https://example.com/${"a".repeat(2048)}.jpg` },
			["coverUrl"],
		],
		["no tracks", { tracks: [] }, ["tracks"]],
		[
			"a track link with ftp",
			{ tracks: [{ title: "A", url: "ftp://example.com/a.mp3" }] },
			["tracks", 0, "url"],
		],
		[
			"a track link with a password",
			{ tracks: [{ title: "A", url: "https://u:p@example.com/a.mp3" }] },
			["tracks", 0, "url"],
		],
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
		const tracks = [track(1), { title: "", url: "not a link" }];
		expect(errorPaths({ ...valid, tracks })).toEqual([
			["tracks", 1, "title"],
			["tracks", 1, "url"],
		]);
	});
});
