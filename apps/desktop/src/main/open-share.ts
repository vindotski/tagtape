import { readFile, stat } from "node:fs/promises";
import {
	albumFromFragment,
	decodeShare,
	MAX_SHARE_BYTES,
	SHARE_EXTENSION,
	SHARE_SCHEME,
	type ShareResult,
	shareFragmentOf,
} from "@tagtape/shared";

export const isShareLink = (text: string): boolean =>
	text.toLowerCase().startsWith(`${SHARE_SCHEME}:`);

/**
 * Reads a shared album from what the system handed the app: the path of a
 * `.tagtape` file, or a `tagtape://open#a=…` link. Whatever it is, the result
 * is either a validated album or a message; this never throws.
 */
export async function readShare(target: string): Promise<ShareResult> {
	if (isShareLink(target)) {
		return albumFromFragment(shareFragmentOf(target) ?? "");
	}
	try {
		// Checked before reading: a "shared album" of gigabytes is never loaded.
		const info = await stat(target);
		if (!info.isFile()) {
			return { ok: false, message: "This isn't a TagTape album" };
		}
		if (info.size > MAX_SHARE_BYTES) {
			return { ok: false, message: "This is too large to be a TagTape album" };
		}
		return decodeShare(await readFile(target, "utf8"));
	} catch {
		return { ok: false, message: "That file couldn't be read" };
	}
}

/**
 * The shared album in a command line, if there is one: on Windows and Linux
 * a double-clicked file or a clicked link arrives as an argument.
 */
export function shareTargetIn(argv: readonly string[]): string | undefined {
	return argv.find(
		(arg) =>
			!arg.startsWith("-") &&
			(isShareLink(arg) || arg.toLowerCase().endsWith(`.${SHARE_EXTENSION}`)),
	);
}
