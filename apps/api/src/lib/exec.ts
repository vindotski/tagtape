import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

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
 * legacy app's `shell_exec("youtube-dl $value")`).
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
		// the whole tree: yt-dlp spawns ffmpeg, and killing only yt-dlp would
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
