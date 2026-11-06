import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { Readable } from "node:stream";

export interface RunOptions {
	signal?: AbortSignal;
	/** Kill the process after this many milliseconds. */
	timeoutMs?: number;
	/** Called for every stdout line as it arrives (stdout is still collected). */
	onLine?: (line: string) => void;
	/** Cap on collected stdout, in bytes. */
	maxStdoutBytes?: number;
}

export interface RunResult {
	stdout: string;
	stderr: string;
}

const STDERR_TAIL_BYTES = 8 * 1024;

export class ExecError extends Error {
	override name = "ExecError";
	readonly exitCode: number | null;
	readonly stderr: string;
	readonly timedOut: boolean;

	constructor(
		message: string,
		details: { exitCode: number | null; stderr: string; timedOut: boolean },
	) {
		super(message);
		this.exitCode = details.exitCode;
		this.stderr = details.stderr;
		this.timedOut = details.timedOut;
	}
}

/**
 * Runs a binary with an argument array. There is **never a shell**, so arguments
 * are passed to the program verbatim and can't inject commands (unlike the
 * v1 app, which built a shell command string from the user's URL).
 */
export function run(
	command: string,
	args: readonly string[],
	options: RunOptions = {},
): Promise<RunResult> {
	const {
		signal,
		timeoutMs,
		onLine,
		maxStdoutBytes = 32 * 1024 * 1024,
	} = options;
	const timeout = timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined;
	const signals = [signal, timeout].filter(
		(s): s is AbortSignal => s !== undefined,
	);
	const combined = signals.length > 0 ? AbortSignal.any(signals) : undefined;

	return new Promise((resolve, reject) => {
		if (combined?.aborted) {
			reject(abortError(timeout, command));
			return;
		}

		// `detached` puts the child in its own process group, so cancelling kills
		// the whole tree: a tool may start its own children (a downloader starting
		// ffmpeg), and killing only the parent would
		// leave ffmpeg running as an orphan.
		const child = spawn(command, args, {
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
			detached: process.platform !== "win32",
		});
		const killTree = () => {
			if (child.pid === undefined || child.exitCode !== null) return;
			try {
				process.kill(-child.pid, "SIGKILL");
			} catch {
				child.kill("SIGKILL");
			}
		};
		combined?.addEventListener("abort", killTree, { once: true });

		let stdout = "";
		let stdoutBytes = 0;
		let stderr = "";
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");

		const lines = createInterface({ input: child.stdout });
		lines.on("line", (line) => {
			stdoutBytes += Buffer.byteLength(line) + 1;
			if (stdoutBytes <= maxStdoutBytes) stdout += `${line}\n`;
			onLine?.(line);
		});
		child.stderr.on("data", (chunk: string) => {
			stderr = (stderr + chunk).slice(-STDERR_TAIL_BYTES);
		});

		child.once("error", (error) => {
			if (combined?.aborted) {
				reject(abortError(timeout, command));
				return;
			}
			reject(
				new ExecError(`Failed to start ${command}: ${error.message}`, {
					exitCode: null,
					stderr,
					timedOut: false,
				}),
			);
		});

		child.once("close", (exitCode) => {
			combined?.removeEventListener("abort", killTree);
			lines.close();
			if (combined?.aborted) {
				reject(abortError(timeout, command));
			} else if (stdoutBytes > maxStdoutBytes) {
				reject(
					new ExecError(
						`${command} produced more than ${maxStdoutBytes} bytes`,
						{
							exitCode,
							stderr,
							timedOut: false,
						},
					),
				);
			} else if (exitCode === 0) {
				resolve({ stdout, stderr });
			} else {
				reject(
					new ExecError(`${command} exited with code ${exitCode}`, {
						exitCode,
						stderr,
						timedOut: false,
					}),
				);
			}
		});
	});
}

export interface StreamProcess {
	/** The process's stdout, consumed by the caller (backpressure applies). */
	stdout: Readable;
	/**
	 * Settles when the process exits: resolves on exit code 0, rejects with an
	 * `ExecError` (non-zero exit, carries the stderr tail) or an `AbortError`.
	 */
	done: Promise<void>;
}

/**
 * Like `run`, but streams stdout instead of collecting it, so audio can flow
 * from one process to the next and to the client without touching disk.
 * Same guarantees: no shell, its own process group, the whole group is killed
 * on abort or timeout.
 */
export function spawnStream(
	command: string,
	args: readonly string[],
	options: {
		signal: AbortSignal;
		stdin?: string | Readable;
		timeoutMs?: number;
	},
): StreamProcess {
	const timeout = options.timeoutMs
		? AbortSignal.timeout(options.timeoutMs)
		: undefined;
	const signal = timeout
		? AbortSignal.any([options.signal, timeout])
		: options.signal;

	const child = spawn(command, args, {
		shell: false,
		stdio: [options.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
		detached: process.platform !== "win32",
	});
	const killTree = () => {
		if (child.pid === undefined || child.exitCode !== null) return;
		try {
			process.kill(-child.pid, "SIGKILL");
		} catch {
			child.kill("SIGKILL");
		}
	};
	if (signal.aborted) killTree();
	else signal.addEventListener("abort", killTree, { once: true });

	if (child.stdin) {
		// The child may exit before reading all its input (EPIPE): that's reported
		// through `done`, not as an unhandled stream error.
		child.stdin.on("error", () => {});
		if (typeof options.stdin === "string") {
			child.stdin.end(options.stdin);
		} else if (options.stdin) {
			options.stdin.on("error", () => child.stdin?.destroy());
			options.stdin.pipe(child.stdin);
		}
	}

	// stdout and stderr are always "pipe" above.
	const stdout = child.stdout as Readable;
	const stderrStream = child.stderr as Readable;
	let stderr = "";
	stderrStream.setEncoding("utf8");
	stderrStream.on("data", (chunk: string) => {
		stderr = (stderr + chunk).slice(-STDERR_TAIL_BYTES);
	});

	const done = new Promise<void>((resolve, reject) => {
		child.once("error", (error) => {
			signal.removeEventListener("abort", killTree);
			reject(
				signal.aborted
					? abortError(timeout, command)
					: new ExecError(`Failed to start ${command}: ${error.message}`, {
							exitCode: null,
							stderr,
							timedOut: false,
						}),
			);
		});
		child.once("close", (exitCode) => {
			signal.removeEventListener("abort", killTree);
			if (signal.aborted) reject(abortError(timeout, command));
			else if (exitCode === 0) resolve();
			else {
				reject(
					new ExecError(`${command} exited with code ${exitCode}`, {
						exitCode,
						stderr,
						timedOut: false,
					}),
				);
			}
		});
	});
	// Callers usually await `done`, but never let an early failure become an
	// unhandled rejection that would crash the process.
	done.catch(() => {});

	return { stdout, done };
}

function abortError(timeout: AbortSignal | undefined, command: string): Error {
	if (timeout?.aborted) {
		return new ExecError(`${command} timed out`, {
			exitCode: null,
			stderr: "",
			timedOut: true,
		});
	}
	return new DOMException(`${command} was cancelled`, "AbortError");
}
