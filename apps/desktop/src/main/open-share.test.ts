import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	albumInputSchema,
	encodeShare,
	MAX_SHARE_BYTES,
	shareFragment,
} from "@tagtape/shared";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { readShare, shareTargetIn } from "./open-share.ts";

const album = albumInputSchema.parse({
	title: "Glass Harbour",
	artist: "The Lamplighters",
	tracks: [{ title: "Paper Lanterns", url: "https://example.com/1.mp3" }],
});

let dir: string;
beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "tagtape-share-"));
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe("readShare", () => {
	test("reads a .tagtape file", async () => {
		const file = join(dir, "album.tagtape");
		await writeFile(file, encodeShare(album));
		expect(await readShare(file)).toEqual({ ok: true, album });
	});

	test("reads a tagtape:// link", async () => {
		expect(await readShare(`tagtape://open#${shareFragment(album)}`)).toEqual({
			ok: true,
			album,
		});
		expect((await readShare("tagtape://open")).ok).toBe(false);
		expect((await readShare("TAGTAPE://open#a=junk")).ok).toBe(false);
	});

	test("a missing file, a folder, a damaged or huge file: a message, never a throw", async () => {
		expect(await readShare(join(dir, "nope.tagtape"))).toEqual({
			ok: false,
			message: "That file couldn't be read",
		});
		expect((await readShare(dir)).ok).toBe(false);

		const damaged = join(dir, "damaged.tagtape");
		await writeFile(damaged, "{ not json");
		expect((await readShare(damaged)).ok).toBe(false);

		const huge = join(dir, "huge.tagtape");
		await writeFile(huge, "x".repeat(MAX_SHARE_BYTES + 1));
		expect(await readShare(huge)).toEqual({
			ok: false,
			message: "This is too large to be a TagTape album",
		});
	});
});

describe("shareTargetIn", () => {
	test("finds a file or a link among the arguments", () => {
		expect(
			shareTargetIn(["--allow-file-access", "C:\\Music\\Album.TAGTAPE"]),
		).toBe("C:\\Music\\Album.TAGTAPE");
		expect(shareTargetIn(["--flag", "tagtape://open#a=abc"])).toBe(
			"tagtape://open#a=abc",
		);
	});

	test("ignores flags and anything else", () => {
		expect(shareTargetIn([])).toBeUndefined();
		expect(
			shareTargetIn(["--user-data-dir=/x/y.tagtape", ".", "notes.txt"]),
		).toBeUndefined();
	});
});
