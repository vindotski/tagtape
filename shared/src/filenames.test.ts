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
		expect(Array.from(safeFileName("🎵".repeat(500), "x"))).toHaveLength(120);
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
