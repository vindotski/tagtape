import { describe, expect, test } from "vitest";
import { getYouTubeVideoId, parseYouTubeUrl } from "./youtube.ts";

const ID = "dQw4w9WgXcQ";
const CANONICAL = `https://www.youtube.com/watch?v=${ID}`;

describe("parseYouTubeUrl", () => {
	test.each([
		`https://www.youtube.com/watch?v=${ID}`,
		`http://youtube.com/watch?v=${ID}`,
		`https://m.youtube.com/watch?v=${ID}`,
		`https://music.youtube.com/watch?v=${ID}&si=abc`,
		`https://www.youtube.com/watch?v=${ID}&list=PL1234567890&index=3`,
		`https://www.youtube.com/watch?feature=share&v=${ID}`,
		`https://youtu.be/${ID}`,
		`https://youtu.be/${ID}?t=42`,
		`https://www.youtube.com/shorts/${ID}`,
		`https://www.youtube.com/embed/${ID}`,
		`https://www.youtube.com/live/${ID}`,
		`youtube.com/watch?v=${ID}`,
		`  https://YOUTU.BE/${ID}  `,
	])("accepts %s", (input) => {
		expect(parseYouTubeUrl(input)).toBe(CANONICAL);
	});

	test.each([
		["empty", ""],
		["not a url", "never gonna give you up"],
		["playlist page", "https://www.youtube.com/playlist?list=PL1234567890"],
		["channel", "https://www.youtube.com/@RickAstleyYT"],
		["watch without id", "https://www.youtube.com/watch"],
		["id too short", "https://youtu.be/abc"],
		["id with bad chars", "https://youtu.be/dQw4w9WgXc!"],
		["other site", `https://vimeo.com/watch?v=${ID}`],
		["lookalike host", `https://youtube.com.evil.example/watch?v=${ID}`],
		["subdomain trick", `https://evil-youtube.com/watch?v=${ID}`],
		["credentials", `https://user:pass@youtube.com/watch?v=${ID}`],
		["custom port", `https://youtube.com:8443/watch?v=${ID}`],
		["file scheme", `file:///etc/passwd?v=${ID}`],
		["javascript scheme", "javascript:alert(1)"],
		["extra path", `https://www.youtube.com/shorts/${ID}/extra`],
		["option injection", "--exec=touch /tmp/pwned"],
	])("rejects %s", (_label, input) => {
		expect(parseYouTubeUrl(input)).toBeNull();
	});
});

describe("getYouTubeVideoId", () => {
	test("returns the bare id", () => {
		expect(getYouTubeVideoId(`https://youtu.be/${ID}`)).toBe(ID);
	});
});
