import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";

/** A rectangle on the desktop, in the screen's own points. */
export interface Area {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface WindowState {
	width: number;
	height: number;
	/** Unset: let the system place the window. */
	x?: number;
	y?: number;
	maximized: boolean;
}

const stateSchema = z.object({
	width: z.int().positive(),
	height: z.int().positive(),
	x: z.int(),
	y: z.int(),
	maximized: z.boolean(),
});

/** How much of the window's top edge must be on a screen to count as reachable. */
const GRAB = 80;

/**
 * Where the window opens: where it was last time, unless that was never
 * saved, is damaged, or is no longer on a connected screen (a monitor was
 * unplugged). Then the default size, placed by the system.
 */
export function restoreWindowState(
	saved: unknown,
	screens: Area[],
	fallback: { width: number; height: number },
	minimum: { width: number; height: number },
): WindowState {
	const parsed = stateSchema.safeParse(saved);
	if (!parsed.success) return { ...fallback, maximized: false };
	const state = parsed.data;
	// The title bar is what the window is moved by: some of it must be on screen.
	const reachable = screens.some(
		(screen) =>
			state.x + state.width >= screen.x + GRAB &&
			state.x <= screen.x + screen.width - GRAB &&
			state.y >= screen.y &&
			state.y <= screen.y + screen.height - GRAB,
	);
	if (!reachable) return { ...fallback, maximized: state.maximized };
	return {
		...state,
		width: Math.max(state.width, minimum.width),
		height: Math.max(state.height, minimum.height),
	};
}

/** The saved state as it is on disk; undefined when there is none to read. */
export function readWindowState(file: string): unknown {
	try {
		return JSON.parse(readFileSync(file, "utf8"));
	} catch {
		return undefined;
	}
}

/** Best effort: a window that can't save its place opens at the default one. */
export function writeWindowState(file: string, state: WindowState): void {
	try {
		writeFileSync(file, JSON.stringify(state), { mode: 0o600 });
	} catch {
		// Nothing to do about it, and nothing depends on it.
	}
}
