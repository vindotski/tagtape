import { describe, expect, test } from "vitest";
import { type Album, albumInputSchema } from "./album.ts";
import {
	albumFromFragment,
	appLink,
	decodeShare,
	encodeShare,
	MAX_SHARE_BYTES,
	shareFragment,
	shareFragmentOf,
} from "./share.ts";

const album: Album = albumInputSchema.parse({
	title: "Glass Harbour",
	artist: "The Lamplighters",
	genre: "Indie",
	year: "2026",
	coverUrl: "https://example.com/cover.jpg",
	tracks: [
		{ title: "Paper Lanterns", url: "https://example.com/1.mp3" },
		{ title: "Night Bus", url: "https://example.com/2.mp3" },
	],
});
const plain: Album = albumInputSchema.parse({
	title: "Żółć & 夜のドライブ 🎧",
	artist: "Ærø",
	tracks: [{ title: "Один", url: "https://example.com/a.mp3?x=1&y=2" }],
});

describe("a shared album as a file", () => {
	test("comes back as it went in", () => {
		expect(decodeShare(encodeShare(album))).toEqual({ ok: true, album });
		expect(decodeShare(encodeShare(plain))).toEqual({ ok: true, album: plain });
	});

	test("holds only the album: details, track titles and links", () => {
		const extra = { ...album, secret: "x" } as Album;
		expect(JSON.parse(encodeShare(extra))).toEqual({
			tagtape: 1,
			album: {
				title: "Glass Harbour",
				artist: "The Lamplighters",
				genre: "Indie",
				year: "2026",
				coverUrl: "https://example.com/cover.jpg",
				tracks: album.tracks,
			},
		});
		expect(JSON.parse(encodeShare(plain)).album).not.toHaveProperty("genre");
	});

	test.each([
		["not JSON", "{ nope"],
		["another JSON file", '{"name":"x"}'],
		["a list", "[1,2]"],
		["no album", '{"tagtape":1}'],
		["a text version", '{"tagtape":"1","album":{}}'],
	])("%s isn't an album", (_name, text) => {
		expect(decodeShare(text)).toEqual({
			ok: false,
			message: expect.stringContaining("isn't a TagTape album"),
		});
	});

	test("an album the form wouldn't accept is refused, with the reason", () => {
		const share = JSON.parse(encodeShare(album));
		share.album.tracks = Array.from({ length: 11 }, (_, i) => ({
			title: `T${i}`,
			url: "https://example.com/t.mp3",
		}));
		expect(decodeShare(JSON.stringify(share))).toEqual({
			ok: false,
			message: "This isn't a TagTape album: You can add up to 10 tracks",
		});

		share.album.tracks = [{ title: "T", url: "file:///etc/passwd" }];
		expect(decodeShare(JSON.stringify(share)).ok).toBe(false);
		share.album.tracks = [{ title: "T", url: "javascript:alert(1)" }];
		expect(decodeShare(JSON.stringify(share)).ok).toBe(false);
	});

	test("one from a newer TagTape says so", () => {
		expect(decodeShare('{"tagtape":2,"album":{}}')).toEqual({
			ok: false,
			message: expect.stringContaining("newer TagTape"),
		});
	});

	test("something huge is refused before it is read", () => {
		expect(decodeShare(" ".repeat(MAX_SHARE_BYTES + 1))).toEqual({
			ok: false,
			message: expect.stringContaining("too large"),
		});
	});
});

describe("a shared album inside a link", () => {
	test("comes back as it went in, with or without the #", () => {
		const fragment = shareFragment(album);
		expect(fragment).toMatch(/^a=[A-Za-z0-9_-]+$/);
		expect(albumFromFragment(fragment)).toEqual({ ok: true, album });
		expect(albumFromFragment(`#${fragment}`)).toEqual({ ok: true, album });
		expect(albumFromFragment(shareFragment(plain))).toEqual({
			ok: true,
			album: plain,
		});
	});

	test("every length of text survives the encoding", () => {
		for (let length = 1; length <= 12; length++) {
			const one: Album = { ...plain, title: "é".repeat(length) };
			expect(albumFromFragment(shareFragment(one))).toEqual({
				ok: true,
				album: one,
			});
		}
	});

	test.each([
		["nothing", ""],
		["another fragment", "#downloads"],
		["characters outside the alphabet", "#a=abc+/="],
		["a cut-off value", "#a=abcde"],
		["bytes that aren't text", "#a=_____w"],
		["text that isn't an album", "#a=aGVsbG8"],
	])("%s isn't an album", (_name, fragment) => {
		expect(albumFromFragment(fragment).ok).toBe(false);
	});

	test("an overlong link is refused", () => {
		expect(albumFromFragment(`#a=${"A".repeat(60_000)}`)).toEqual({
			ok: false,
			message: expect.stringContaining("too large"),
		});
	});

	test("the app's link, unless it is too long for a command line", () => {
		const fragment = shareFragment(album);
		expect(appLink(`#${fragment}`)).toBe(`tagtape://open#${fragment}`);
		expect(appLink(fragment)).toBe(`tagtape://open#${fragment}`);
		expect(appLink(`a=${"A".repeat(30_000)}`)).toBeNull();
	});

	test("finds the fragment of either kind of link", () => {
		expect(shareFragmentOf("https://tagtape.app/open/#a=abc")).toBe("#a=abc");
		expect(shareFragmentOf("tagtape://open#a=abc")).toBe("#a=abc");
		expect(shareFragmentOf("tagtape://open")).toBeNull();
	});
});
