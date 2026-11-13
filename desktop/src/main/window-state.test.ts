import { describe, expect, test } from "vitest";
import { restoreWindowState } from "./window-state.ts";

const screens = [{ x: 0, y: 0, width: 1440, height: 900 }];
const fallback = { width: 1080, height: 860 };
const minimum = { width: 720, height: 560 };
const restore = (saved: unknown, on = screens) =>
	restoreWindowState(saved, on, fallback, minimum);

describe("restoreWindowState", () => {
	test("nothing saved, or something unreadable: the default size", () => {
		expect(restore(undefined)).toEqual({ ...fallback, maximized: false });
		expect(restore({ width: "wide" })).toEqual({
			...fallback,
			maximized: false,
		});
	});

	test("opens where it was", () => {
		const saved = { x: 100, y: 60, width: 900, height: 700, maximized: false };
		expect(restore(saved)).toEqual(saved);
	});

	test("a window left on a screen that's gone opens at the default place", () => {
		const saved = { x: 2000, y: 60, width: 900, height: 700, maximized: true };
		expect(restore(saved)).toEqual({ ...fallback, maximized: true });
		// Still there while the second screen is connected.
		expect(
			restore(saved, [
				...screens,
				{ x: 1440, y: 0, width: 1920, height: 1080 },
			]),
		).toEqual(saved);
	});

	test("a title bar above or below every screen can't be reached", () => {
		expect(
			restore({ x: 100, y: -40, width: 900, height: 700, maximized: false }),
		).toEqual({ ...fallback, maximized: false });
		expect(
			restore({ x: 100, y: 880, width: 900, height: 700, maximized: false }),
		).toEqual({ ...fallback, maximized: false });
	});

	test("never smaller than the window may be", () => {
		expect(
			restore({ x: 0, y: 0, width: 300, height: 200, maximized: false }),
		).toMatchObject(minimum);
	});
});
