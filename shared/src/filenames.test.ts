import { describe, expect, test } from "vitest";
import { albumFolderName, safeFileName, trackFileName } from "./filenames.ts";

describe("filenames", () => {
	test.each([
		["keeps unicode", "Ниночка — 夜に駆ける 🎵", "Ниночка — 夜に駆ける 🎵"],
		[
			"strips illegal characters",
			'AC/DC: "Back" in <Black>?',
			"AC DC Back in Black",
		],
		["strips control characters", "a\u0000b\u001fc", "a b c"],
		["no leading dot or trailing dot", "..hidden.", "hidden"],
		["collapses whitespace", "  lots   of\tspace ", "lots of space"],
		["falls back when empty", '/:*?"', "Fallback"],
	])("%s", (_label, input, expected) => {
		expect(safeFileName(input, "Fallback")).toBe(expected);
	});

	test("caps length without splitting characters", () => {
		expect(safeFileName("a".repeat(500), "x")).toHaveLength(120);
		// Four bytes each: the byte limit (200) comes first, at whole characters.
		expect(Array.from(safeFileName("🎵".repeat(500), "x"))).toHaveLength(50);
	});

	test("stays within the file system's byte limit for a name, whatever the script", () => {
		const bytes = (text: string) => new TextEncoder().encode(text).length;
		// 60 + 60 three-byte characters: valid album details, 363 bytes as typed.
		const folder = albumFolderName("夜".repeat(60), "駆".repeat(60));
		expect(bytes(folder)).toBeLessThanOrEqual(200);
		expect(bytes(`${folder} (99)`)).toBeLessThanOrEqual(255);
		// Never half a character.
		expect(folder).toBe(folder.normalize("NFC"));
		expect(
			Array.from(folder).every((c) => c === "夜" || /[ \-駆]/.test(c)),
		).toBe(true);
		const track = trackFileName(7, 10, "🎵".repeat(100));
		expect(bytes(`${track}.part`)).toBeLessThanOrEqual(255);
		expect(track.endsWith(".mp3")).toBe(true);
	});

	test("zero-pads track numbers to sort correctly", () => {
		expect(trackFileName(3, 9, "Song")).toBe("03 - Song.mp3");
		expect(trackFileName(7, 10, "Song")).toBe("07 - Song.mp3");
		expect(trackFileName(1, 1, "")).toBe("01 - Track 1.mp3");
	});

	test("album folder name", () => {
		expect(albumFolderName("The Examples", "Night Drive")).toBe(
			"The Examples - Night Drive",
		);
		expect(albumFolderName("AC/DC", "..")).toBe("AC DC -");
	});
});
