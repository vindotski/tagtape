import { stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { UserFacingError } from "../lib/errors.ts";
import { ExecError, run } from "../lib/exec.ts";
import type { ProbeResult } from "./types.ts";

export interface YtDlpOptions {
	bin: string;
	ffmpegBin: string;
	jsRuntime: string;
	timeoutMs: number;
}

/** Flags every invocation gets: ignore user/system config files for reproducible runs. */
function baseArgs(options: YtDlpOptions): string[] {
	const args = ["--ignore-config", "--no-warnings", "--no-cache-dir"];
	if (options.jsRuntime) args.push("--js-runtimes", options.jsRuntime);
	return args;
}

/**
 * Metadata only. `--` ends option parsing, so even a URL starting with `-`
 * could never be read as a flag (URLs are already canonical by this point).
 */
export function probeArgs(url: string, options: YtDlpOptions): string[] {
	return [
		...baseArgs(options),
		"--no-playlist",
		"--skip-download",
		"--dump-single-json",
		"--",
		url,
	];
}

/**
 * Download from a saved info JSON, so YouTube isn't asked for the metadata
 * a second time (legacy fetched every video twice).
 */
export function downloadArgs(
	infoPath: string,
	outputTemplate: string,
	options: YtDlpOptions,
): string[] {
	return [
		...baseArgs(options),
		"--load-info-json",
		infoPath,
		"--no-progress",
		"--newline",
		"--extract-audio",
		"--audio-format",
		"mp3",
		"--audio-quality",
		"0",
		"--ffmpeg-location",
		options.ffmpegBin,
		"--no-mtime",
		"--output",
		outputTemplate,
	];
}

const KNOWN_ERRORS: ReadonlyArray<readonly [RegExp, string]> = [
	[/private video/i, "This video is private"],
	[
		/sign in to confirm your age|age-restricted/i,
		"This video is age-restricted",
	],
	[/members-only|join this channel/i, "This video is for channel members only"],
	[
		/not available in your country|geo.?restrict/i,
		"This video isn't available in our region",
	],
	[/copyright/i, "This video was removed for copyright reasons"],
	[
		/video (?:is )?unavailable|no longer available|has been removed|does not exist/i,
		"This video is unavailable",
	],
	[/premieres in|live event will begin/i, "This video hasn't premiered yet"],
	[
		/live stream recording is not available/i,
		"This live stream's recording isn't available",
	],
];

/** Turns yt-dlp's stderr into a short message that's safe to show users. */
export function describeYtDlpFailure(stderr: string): string {
	const errorLines = stderr
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.startsWith("ERROR:"));
	const last = errorLines.at(-1) ?? "";
	for (const [pattern, message] of KNOWN_ERRORS) {
		if (pattern.test(last)) return message;
	}
	return "YouTube refused to provide this video";
}

function toUserFacing(error: unknown, action: string): unknown {
	if (error instanceof ExecError) {
		if (error.timedOut) return new UserFacingError(`Timed out while ${action}`);
		if (error.exitCode === null) return error; // couldn't even start yt-dlp: operator problem
		return new UserFacingError(describeYtDlpFailure(error.stderr));
	}
	return error;
}

interface YtDlpInfo {
	title?: unknown;
	duration?: unknown;
	is_live?: unknown;
	live_status?: unknown;
}

export function parseProbe(json: string): ProbeResult {
	const info = JSON.parse(json) as YtDlpInfo;
	const liveStatus =
		typeof info.live_status === "string" ? info.live_status : "";
	return {
		title: typeof info.title === "string" ? info.title : "",
		durationSeconds:
			typeof info.duration === "number" && Number.isFinite(info.duration)
				? Math.round(info.duration)
				: null,
		isLive:
			info.is_live === true ||
			liveStatus === "is_live" ||
			liveStatus === "is_upcoming" ||
			liveStatus === "post_live",
	};
}

export function createYtDlp(options: YtDlpOptions) {
	return {
		async probe(input: {
			url: string;
			infoPath: string;
			signal: AbortSignal;
		}): Promise<ProbeResult> {
			try {
				const { stdout } = await run(
					options.bin,
					probeArgs(input.url, options),
					{
						signal: input.signal,
						timeoutMs: options.timeoutMs,
					},
				);
				await writeFile(input.infoPath, stdout);
				return parseProbe(stdout);
			} catch (error) {
				throw toUserFacing(error, "reading the video's details");
			}
		},

		async downloadAudio(input: {
			infoPath: string;
			workDir: string;
			baseName: string;
			signal: AbortSignal;
			onConverting: () => void;
		}): Promise<string> {
			const template = join(input.workDir, `${input.baseName}.%(ext)s`);
			const mp3Path = join(input.workDir, `${input.baseName}.mp3`);
			let converting = false;
			try {
				await run(
					options.bin,
					downloadArgs(input.infoPath, template, options),
					{
						signal: input.signal,
						timeoutMs: options.timeoutMs,
						onLine: (line) => {
							if (!converting && line.startsWith("[ExtractAudio]")) {
								converting = true;
								input.onConverting();
							}
						},
					},
				);
			} catch (error) {
				throw toUserFacing(error, "downloading the audio");
			}
			const file = await stat(mp3Path).catch(() => null);
			if (!file?.isFile() || file.size === 0) {
				throw new UserFacingError("Conversion to MP3 produced no file");
			}
			return mp3Path;
		},

		async version(): Promise<string> {
			const { stdout } = await run(options.bin, ["--version"], {
				timeoutMs: 10_000,
			});
			return stdout.trim();
		},
	};
}
