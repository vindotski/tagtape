import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import { dirname } from "node:path";

/** When the log reaches this size at start-up, it becomes `<file>.old` and a new one begins. */
const MAX_BYTES = 1024 * 1024;

type Level = "info" | "warn" | "error";
export type FileLog = Record<Level, (obj: object, msg: string) => void>;

/** An error as text worth reading later: message, code, stack, and what caused it. */
function describe(value: unknown): unknown {
	if (!(value instanceof Error)) return value;
	const { code } = value as NodeJS.ErrnoException;
	return {
		message: value.message,
		...(code ? { code } : {}),
		stack: value.stack,
		...(value.cause === undefined ? {} : { cause: describe(value.cause) }),
	};
}

/**
 * A log people can find: one line per event in a file in the app's data
 * folder (and on the console, for development). A packaged app has no
 * console anyone sees, so without this its errors vanish. It holds what the
 * app did and what went wrong, which can include the links being converted;
 * it never leaves the computer.
 *
 * `file` is asked for at the first line, not before: the data folder isn't
 * known until the app has started. Logging never throws.
 */
export function createLog(file: () => string): FileLog {
	let path: string | undefined;
	function open(): string {
		if (path) return path;
		path = file();
		try {
			mkdirSync(dirname(path), { recursive: true });
			if (statSync(path).size > MAX_BYTES) renameSync(path, `${path}.old`);
		} catch {
			// No log yet, or it can't be rotated: carry on.
		}
		return path;
	}
	const write = (level: Level) => (obj: object, msg: string) => {
		console[level](msg, obj);
		try {
			const details = JSON.stringify(obj, (_key, value) => describe(value));
			appendFileSync(
				open(),
				`${new Date().toISOString()} ${level.toUpperCase()} ${msg}${details === "{}" ? "" : ` ${details}`}\n`,
				{ mode: 0o600 },
			);
		} catch {
			// A log that can't be written must not take the app down with it.
		}
	};
	return { info: write("info"), warn: write("warn"), error: write("error") };
}
