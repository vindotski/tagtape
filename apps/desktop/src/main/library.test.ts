import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Album } from "@tagtape/shared";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { HISTORY_LIMIT, openLibrary } from "./library.ts";

let dir: string;
let file: string;
beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "tagtape-library-"));
	file = join(dir, "nested", "library.json");
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

const album = (title: string, tracks = 2): Album => ({
	title,
	artist: "The Examples",
	year: "2026",
	coverUrl: "https://example.com/cover.jpg",
	tracks: Array.from({ length: tracks }, (_, i) => ({
		title: `Track ${i + 1}`,
		url: `https://music.example.com/t/0${i + 1}`,
	})),
});

describe("album history", () => {
	test("keeps an album as it was typed, and survives a restart", async () => {
		const id = await openLibrary(file).record(album("Night Drive"), undefined);

		const reopened = openLibrary(file);
		expect(await reopened.get(id)).toMatchObject({
			id,
			title: "Night Drive",
			artist: "The Examples",
			genre: null,
			year: 2026,
			trackCount: 2,
			coverUrl: "https://example.com/cover.jpg",
			tracks: [
				{ title: "Track 1", url: "https://music.example.com/t/01" },
				{ title: "Track 2", url: "https://music.example.com/t/02" },
			],
		});
		// Lists carry no links.
		const [listed] = await reopened.list(10);
		expect(listed).toMatchObject({ id, title: "Night Drive", trackCount: 2 });
		expect(listed).not.toHaveProperty("tracks");
		expect(listed).not.toHaveProperty("coverUrl");
		// Only the library file is left: no temp file.
		expect(await readdir(join(dir, "nested"))).toEqual(["library.json"]);
	});

	test("making an album again updates it and moves it to the front", async () => {
		let time = new Date("2026-11-13T10:00:00Z");
		const library = openLibrary(file, { now: () => time });
		const first = await library.record(album("First"), undefined);
		await library.record(album("Second"), undefined);

		time = new Date("2026-11-13T11:00:00Z");
		expect(await library.record(album("First, again", 3), first)).toBe(first);

		const listed = await library.list(10);
		expect(listed.map((a) => a.title)).toEqual(["First, again", "Second"]);
		expect(listed[0]).toMatchObject({
			trackCount: 3,
			createdAt: "2026-11-13T10:00:00.000Z",
			updatedAt: "2026-11-13T11:00:00.000Z",
		});
	});

	test("an unknown album id records a new album", async () => {
		const library = openLibrary(file);
		const id = await library.record(
			album("New"),
			"00000000-0000-4000-8000-000000000000",
		);
		expect(id).not.toBe("00000000-0000-4000-8000-000000000000");
		expect(await library.list(10)).toHaveLength(1);
	});

	test(`keeps the last ${HISTORY_LIMIT} albums`, async () => {
		const library = openLibrary(file);
		for (let i = 0; i < HISTORY_LIMIT + 2; i++) {
			await library.record(album(`Album ${i}`), undefined);
		}
		const listed = await library.list(100);
		expect(listed).toHaveLength(HISTORY_LIMIT);
		expect(listed[0]?.title).toBe(`Album ${HISTORY_LIMIT + 1}`);
		expect(listed.at(-1)?.title).toBe("Album 2");
	});

	test("removes an album", async () => {
		const library = openLibrary(file);
		const id = await library.record(album("Gone"), undefined);
		expect(await library.remove(id)).toBe(true);
		expect(await library.remove(id)).toBe(false);
		expect(await library.get(id)).toBeNull();
	});

	test("quick saves don't lose each other", async () => {
		const library = openLibrary(file);
		await Promise.all(
			Array.from({ length: 10 }, (_, i) =>
				library.record(album(`Album ${i}`), undefined),
			),
		);
		expect(await openLibrary(file).list(100)).toHaveLength(10);
	});

	test("a damaged file reads as empty and is replaced on the next save", async () => {
		await openLibrary(file).record(album("Before"), undefined);
		await writeFile(file, "{ not json");
		const library = openLibrary(file);
		expect(await library.list(10)).toEqual([]);
		await library.record(album("After"), undefined);
		expect(JSON.parse(await readFile(file, "utf8")).albums).toHaveLength(1);
	});
});

describe("finished albums", () => {
	const covers = () => readdir(join(dir, "nested", "covers"));

	test("remembers the folder and keeps a small cover", async () => {
		const library = openLibrary(file);
		const id = await library.record(album("Night Drive"), undefined);
		expect((await library.list(10))[0]?.hasCover).toBe(false);
		expect(await library.cover(id)).toBeNull();

		expect(
			await library.finished(id, {
				folder: "/music/Night Drive",
				cover: Buffer.from("jpeg"),
			}),
		).toBe(true);

		const reopened = openLibrary(file);
		expect(await reopened.get(id)).toMatchObject({
			folder: "/music/Night Drive",
			hasCover: true,
		});
		expect((await reopened.list(10))[0]).toMatchObject({ hasCover: true });
		expect((await reopened.list(10))[0]).not.toHaveProperty("folder");
		expect(await reopened.cover(id)).toEqual(Buffer.from("jpeg"));
		expect(await covers()).toEqual([`${id}.jpg`]);
	});

	test("making it again keeps the old cover until the new run finishes", async () => {
		const library = openLibrary(file);
		const id = await library.record(album("Night Drive"), undefined);
		await library.finished(id, { folder: "/a", cover: Buffer.from("one") });

		await library.record(album("Night Drive"), id);
		expect(await library.cover(id)).toEqual(Buffer.from("one"));

		// Made again without a cover: the old one goes.
		await library.finished(id, { folder: "/b" });
		expect(await library.get(id)).toMatchObject({ folder: "/b" });
		expect(await library.get(id)).not.toHaveProperty("hasCover");
		expect(await library.cover(id)).toBeNull();
		expect(await covers()).toEqual([]);
	});

	test("an album deleted while it was being made is not brought back", async () => {
		const library = openLibrary(file);
		const id = await library.record(album("Gone"), undefined);
		await library.remove(id);
		expect(
			await library.finished(id, { folder: "/a", cover: Buffer.from("x") }),
		).toBe(false);
		expect(await library.list(10)).toEqual([]);
		await expect(covers()).rejects.toMatchObject({ code: "ENOENT" });
	});

	test("covers go with their albums: removed, or pushed out by newer ones", async () => {
		const library = openLibrary(file);
		const oldest = await library.record(album("Oldest"), undefined);
		await library.finished(oldest, { folder: "/a", cover: Buffer.from("x") });
		const removed = await library.record(album("Removed"), undefined);
		await library.finished(removed, { folder: "/b", cover: Buffer.from("y") });
		expect((await covers()).length).toBe(2);

		await library.remove(removed);
		expect(await covers()).toEqual([`${oldest}.jpg`]);

		for (let i = 0; i < HISTORY_LIMIT; i++) {
			await library.record(album(`Album ${i}`), undefined);
		}
		expect(await library.get(oldest)).toBeNull();
		expect(await covers()).toEqual([]);
	});

	test("clearing forgets every album and cover, but not the save folder", async () => {
		const library = openLibrary(file);
		await library.setDestination("/music");
		const id = await library.record(album("One"), undefined);
		await library.finished(id, { folder: "/a", cover: Buffer.from("x") });
		await library.record(album("Two"), undefined);

		expect(await library.clear()).toBe(2);
		const reopened = openLibrary(file);
		expect(await reopened.list(10)).toEqual([]);
		expect(await reopened.destination()).toBe("/music");
		expect(await covers()).toEqual([]);
	});

	test("a library file from before folders and covers still loads", async () => {
		const id = await openLibrary(file).record(album("Old"), undefined);
		const library = openLibrary(file);
		expect(await library.get(id)).not.toHaveProperty("folder");
		expect((await library.list(10))[0]?.hasCover).toBe(false);
	});
});

test("remembers where albums are saved", async () => {
	const library = openLibrary(file);
	expect(await library.destination()).toBeUndefined();
	await library.setDestination("/Users/someone/Music");
	expect(await openLibrary(file).destination()).toBe("/Users/someone/Music");
});
