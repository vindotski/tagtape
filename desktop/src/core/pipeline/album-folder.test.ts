import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createAlbumFolder, discardAlbum, writeTrack } from "./album-folder.ts";

let root: string;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "tagtape-folder-"));
});
afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

const never = new AbortController().signal;
const tag = new Uint8Array([0x49, 0x44, 0x33]);

describe("album folder", () => {
	test("creates the destination and never reuses an existing folder", async () => {
		const destination = join(root, "Music", "New");
		expect(await createAlbumFolder(destination, "A - B")).toBe(
			join(destination, "A - B"),
		);
		expect(await createAlbumFolder(destination, "A - B")).toBe(
			join(destination, "A - B (2)"),
		);
		expect(await createAlbumFolder(destination, "A - B")).toBe(
			join(destination, "A - B (3)"),
		);
	});

	test("a track is the tag followed by the stream, with no .part left", async () => {
		const path = await writeTrack(
			root,
			"01 - Ниночка.mp3",
			tag,
			Readable.from([Buffer.from("one"), Buffer.from("two")]),
			never,
		);
		expect(path).toBe(join(root, "01 - Ниночка.mp3"));
		expect(await readFile(path, "latin1")).toBe("ID3onetwo");
		expect(await readdir(root)).toEqual(["01 - Ниночка.mp3"]);
	});

	test("cleanup waits for the file to be closed, then removes the album folder", async () => {
		const folder = await createAlbumFolder(root, "A - B");
		const stream = new Readable({ read() {} });
		stream.push(Buffer.alloc(256 * 1024));
		setImmediate(() => stream.destroy(new Error("boom")));
		await expect(
			writeTrack(folder, "01.mp3", tag, stream, never),
		).rejects.toThrow("boom");
		// Nothing is open any more, so the folder can go at once (on Windows too).
		await discardAlbum(folder, []);
		expect(await readdir(root)).toEqual([]);
	});

	test("a failing stream leaves no file", async () => {
		const stream = new Readable({ read() {} });
		stream.push(Buffer.from("partial"));
		setImmediate(() => stream.destroy(new Error("boom")));
		await expect(
			writeTrack(root, "01.mp3", tag, stream, never),
		).rejects.toThrow("boom");
		expect(await readdir(root)).toEqual([]);
	});

	test("cancelling mid-track leaves no file and stops the source", async () => {
		const controller = new AbortController();
		const stream = new Readable({ read() {} });
		stream.push(Buffer.from("partial"));
		setImmediate(() => controller.abort());
		await expect(
			writeTrack(root, "01.mp3", tag, stream, controller.signal),
		).rejects.toThrow();
		expect(stream.destroyed).toBe(true);
		expect(await readdir(root)).toEqual([]);
	});

	test("discarding removes our files, and the folder only when it's empty", async () => {
		const ours = join(root, "ours");
		await mkdir(ours);
		await writeFile(join(ours, "01.mp3"), "x");
		await discardAlbum(ours, [join(ours, "01.mp3")]);
		expect(await readdir(root)).toEqual([]);

		const mixed = join(root, "mixed");
		await mkdir(mixed);
		await writeFile(join(mixed, "01.mp3"), "x");
		await writeFile(join(mixed, "notes.txt"), "someone else's");
		await discardAlbum(mixed, [join(mixed, "01.mp3")]);
		expect(await readdir(mixed)).toEqual(["notes.txt"]);
	});
});
