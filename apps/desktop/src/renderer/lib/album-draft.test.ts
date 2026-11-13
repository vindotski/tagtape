import { MAX_TRACKS } from "@tagtape/shared";
import { describe, expect, it } from "vitest";
import {
	addLinks,
	draftFromAlbum,
	linksFromText,
	validateDraft,
} from "./album-draft";
import type { StoredAlbum } from "./albums";

const stored: StoredAlbum = {
	id: "00000000-0000-4000-8000-000000000000",
	title: "Harbour Lights",
	artist: "The Lamplighters",
	genre: null,
	year: 2026,
	trackCount: 2,
	hasCover: false,
	coverRevision: 0,
	folder: "never",
	createdAt: "2026-11-12T10:00:00.000Z",
	updatedAt: "2026-11-12T10:00:00.000Z",
	coverUrl: "https://example.com/cover.jpg",
	tracks: [
		{ title: "Paper Lanterns", url: "https://example.com/1.mp3" },
		{ title: "Night Bus", url: "https://example.com/2.mp3" },
	],
};

describe("draftFromAlbum", () => {
	it("fills the editor with the stored album, with stable keys", () => {
		const draft = draftFromAlbum(stored);
		expect(draft).toEqual({
			title: "Harbour Lights",
			artist: "The Lamplighters",
			genre: "",
			year: "2026",
			coverUrl: "https://example.com/cover.jpg",
			tracks: [
				{
					key: "stored-0",
					title: "Paper Lanterns",
					url: "https://example.com/1.mp3",
				},
				{
					key: "stored-1",
					title: "Night Bus",
					url: "https://example.com/2.mp3",
				},
			],
		});
		expect(validateDraft(draft).ok).toBe(true);
	});

	it("gives an album saved without tracks one empty track", () => {
		const draft = draftFromAlbum({
			...stored,
			coverUrl: null,
			tracks: [],
		});
		expect(draft.coverUrl).toBe("");
		expect(draft.tracks).toEqual([{ key: "stored-0", title: "", url: "" }]);
	});
});

describe("linksFromText", () => {
	it("takes whole http(s) links, in order, once each", () => {
		expect(
			linksFromText(
				"https://example.com/1.mp3\n  http://example.com/2.mp3 https://example.com/1.mp3\r\n",
			),
		).toEqual(["https://example.com/1.mp3", "http://example.com/2.mp3"]);
	});

	it("ignores prose, bare host names and links it wouldn't accept", () => {
		expect(
			linksFromText(
				"see example.com/a.mp3 and ftp://example.com/b https://user:pw@example.com/c # note",
			),
		).toEqual([]);
	});
});

describe("addLinks", () => {
	const track = (key: string, url = "") => ({ key, title: "", url });

	it("fills tracks without a link first, then adds tracks", () => {
		const { tracks, left } = addLinks(
			[track("a", "https://example.com/kept.mp3"), track("b")],
			["https://example.com/1.mp3", "https://example.com/2.mp3"],
		);
		expect(left).toBe(0);
		expect(tracks.map((t) => t.url)).toEqual([
			"https://example.com/kept.mp3",
			"https://example.com/1.mp3",
			"https://example.com/2.mp3",
		]);
		expect(tracks.slice(0, 2).map((t) => t.key)).toEqual(["a", "b"]);
	});

	it("starts at the track that was pasted into", () => {
		const { tracks } = addLinks(
			[track("a"), track("b"), track("c")],
			["https://example.com/1.mp3"],
			1,
		);
		expect(tracks.map((t) => t.url)).toEqual([
			"",
			"https://example.com/1.mp3",
			"",
		]);
	});

	it("stops at the album's limit and says how many were left", () => {
		const links = Array.from(
			{ length: MAX_TRACKS + 3 },
			(_, i) => `https://example.com/${i}.mp3`,
		);
		const { tracks, left } = addLinks([track("a")], links);
		expect(tracks).toHaveLength(MAX_TRACKS);
		expect(left).toBe(3);
	});
});
