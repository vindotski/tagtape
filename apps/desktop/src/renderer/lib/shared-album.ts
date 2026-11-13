import {
	albumInputSchema,
	decodeShare,
	MAX_SHARE_BYTES,
	SHARE_EXTENSION,
	type ShareResult,
} from "@tagtape/shared";
import { useSyncExternalStore } from "react";

/** The shared album on screen, and how many have been opened (a fresh editor each time). */
interface Shown {
	share: ShareResult;
	sequence: number;
}

let shown: Shown | null = null;
const listeners = new Set<() => void>();

/**
 * Puts a shared album (or the reason it couldn't be read) on the "shared"
 * screen. It came from outside the app, so it is checked again here, whoever
 * decoded it first.
 */
export function showShared(share: ShareResult): void {
	let checked: ShareResult = share;
	if (share.ok) {
		const parsed = albumInputSchema.safeParse(share.album);
		checked = parsed.success
			? { ok: true, album: parsed.data }
			: { ok: false, message: "This isn't a TagTape album" };
	}
	shown = { share: checked, sequence: (shown?.sequence ?? 0) + 1 };
	for (const listener of listeners) listener();
}

export function useSharedAlbum(): Shown | null {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		() => shown,
	);
}

/** Whether a dropped file is a shared album, by its name. */
export const isSharedFile = (file: File): boolean =>
	file.name.toLowerCase().endsWith(`.${SHARE_EXTENSION}`);

/** Reads a shared album dropped on the window. The page reads it itself: no path leaves it. */
export async function readSharedFile(file: File): Promise<ShareResult> {
	if (file.size > MAX_SHARE_BYTES) {
		return { ok: false, message: "This is too large to be a TagTape album" };
	}
	try {
		return decodeShare(await file.text());
	} catch {
		return { ok: false, message: "That file couldn't be read" };
	}
}
