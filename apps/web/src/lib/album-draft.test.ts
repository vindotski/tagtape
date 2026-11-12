import { describe, expect, it } from "vitest";
import { draftFromAlbum, validateDraft } from "./album-draft";
import type { StoredAlbum } from "./albums";

const stored: StoredAlbum = {
	id: "00000000-0000-4000-8000-000000000000",
	title: "Harbour Lights",
	artist: "The Lamplighters",
	genre: null,
	year: 2026,
	trackCount: 2,
	createdAt: "2026-11-12T10:00:00.000Z",
	updatedAt: "2026-11-12T10:00:00.000Z",
	coverUrl: "https://example.com/cover.jpg",
	tracks: [
		{ title: "Paper Lanterns", url: "https://example.com/1.mp3" },
		{ title: "Night Bus", url: "https://example.com/2.mp3" },
	],
	complete: true,
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
			complete: false,
		});
		expect(draft.coverUrl).toBe("");
		expect(draft.tracks).toEqual([{ key: "stored-0", title: "", url: "" }]);
	});
});
