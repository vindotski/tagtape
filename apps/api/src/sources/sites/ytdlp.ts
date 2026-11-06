import { PassThrough, type Readable } from "node:stream";
import type { PluginContext, TrackProbe } from "../../plugins/api.ts";
import { YTDLP_EXTRACTORS } from "./sites.ts";

export interface YtDlpOptions {
	bin: string;
	ffmpegBin: string;
	jsRuntime: string;
	timeoutMs: number;
}

/** MP3 bitrate. Constant, because a stream can't go back to write a VBR header. */
export const MP3_BITRATE = "256k";

/**
 * Same format choice for the probe and the stream, so the probe's checks hold.
 * Never DASH: yt-dlp downloads DASH fragments to temporary files even when
 * writing to stdout, and ffmpeg can't take them over (seen with Mixcloud,
 * which also offers HLS and plain HTTP). A DASH-only track fails the check.
 */
export const FORMAT = "bestaudio[protocol!*=dash]/best[protocol!*=dash]";

/** Flags every invocation gets: ignore user/system config files for reproducible runs. */
function baseArgs(options: YtDlpOptions): string[] {
	const args = [
		"--ignore-config",
		"--no-warnings",
		"--no-cache-dir",
		// Second, independent allow-list behind parseTrackUrl: yt-dlp refuses any
		// other extractor, including "generic", which would fetch arbitrary pages.
		"--use-extractors",
		YTDLP_EXTRACTORS,
	];
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
		"-f",
		FORMAT,
		"--skip-download",
		"--dump-single-json",
		"--",
		url,
	];
}

/**
 * Audio to stdout, from the probe's info JSON on stdin: no second metadata
 * fetch (TagTape v1 fetched every video twice) and nothing written to disk.
 * HLS goes through ffmpeg: yt-dlp's native HLS downloader crashes when writing
 * to stdout (seen with SoundCloud, yt-dlp 2026.10.26).
 *
 * The info JSON path is `-`, not `/dev/stdin`: Node connects a child's stdin
 * with a Unix socket pair, and opening `/dev/stdin` on a socket fails with
 * ENXIO ("No such device or address"). `-` makes yt-dlp read the stream it
 * already has.
 */
export function streamArgs(options: YtDlpOptions): string[] {
	return [
		...baseArgs(options),
		"--load-info-json",
		"-",
		"-f",
		FORMAT,
		"--downloader",
		"m3u8:ffmpeg",
		"--ffmpeg-location",
		options.ffmpegBin,
		"--no-progress",
		"--output",
		"-",
	];
}

/**
 * stdin → MP3 on stdout, with no tags and no Xing header: we prepend our own
 * ID3 tag, and a Xing header written before the end of a stream would carry
 * wrong values. MP3 sources (e.g. Bandcamp) are copied, not re-encoded.
 */
export function ffmpegArgs(sourceCodec: string | null): string[] {
	const codec =
		sourceCodec === "mp3"
			? ["-c:a", "copy"]
			: ["-c:a", "libmp3lame", "-b:a", MP3_BITRATE];
	return [
		"-hide_banner",
		"-loglevel",
		"error",
		"-i",
		"pipe:0",
		"-vn",
		"-map_metadata",
		"-1",
		...codec,
		"-id3v2_version",
		"0",
		"-write_id3v1",
		"0",
		"-write_xing",
		"0",
		"-f",
		"mp3",
		"pipe:1",
	];
}

const KNOWN_ERRORS: ReadonlyArray<readonly [RegExp, string]> = [
	[/private (?:video|track)|this track is private/i, "This track is private"],
	// We never try to get around DRM; say so plainly.
	[
		/DRM protected|is DRM|drm-protected/i,
		"This track is copy-protected (DRM) and can't be converted",
	],
	[
		/sign in to confirm your age|age-restricted/i,
		"This track is age-restricted",
	],
	[
		/members-only|join this channel|subscriber.?only|go\+|requires (?:a )?(?:subscription|purchase)|purchase required/i,
		"This track is only available to paying members or subscribers",
	],
	[
		/not available in your country|geo.?restrict|not available in your region/i,
		"This track isn't available in our region",
	],
	[/copyright/i, "This track was removed for copyright reasons"],
	[
		/(?:video|track) (?:is )?unavailable|no longer available|has been removed|does not exist|HTTP Error 404/i,
		"This track is unavailable",
	],
	[/premieres in|live event will begin/i, "This track hasn't premiered yet"],
	[
		/requested format is not available/i,
		"This track is only offered in a format TagTape can't stream",
	],
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
	return "The site refused to provide this track";
}

function toUserFacing(
	ctx: PluginContext,
	error: unknown,
	action: string,
): unknown {
	if (error instanceof ctx.ExecError) {
		if (error.timedOut) {
			return new ctx.UserFacingError(`Timed out while ${action}`);
		}
		if (error.exitCode === null) return error; // couldn't even start yt-dlp: operator problem
		// Keep the original (with yt-dlp's stderr) as the cause, for the logs.
		return new ctx.UserFacingError(describeYtDlpFailure(error.stderr), {
			cause: error,
		});
	}
	return error;
}

/** What the stream step needs from the probe (kept in memory with the job). */
export interface YtDlpState {
	/** yt-dlp's info JSON, handed back to it on stdin: no second metadata fetch. */
	infoJson: string;
	/** Codec of the audio that will be fetched, e.g. `opus` or `mp3` (copied as is). */
	sourceCodec: string | null;
}

interface YtDlpInfo {
	title?: unknown;
	duration?: unknown;
	is_live?: unknown;
	live_status?: unknown;
	acodec?: unknown;
}

export function parseProbe(json: string): TrackProbe & { state: YtDlpState } {
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
		state: {
			infoJson: json,
			sourceCodec: typeof info.acodec === "string" ? info.acodec : null,
		},
	};
}

export function createYtDlp(options: YtDlpOptions, ctx: PluginContext) {
	return {
		async probe(input: {
			url: string;
			signal: AbortSignal;
		}): Promise<TrackProbe> {
			try {
				const { stdout } = await ctx.run(
					options.bin,
					probeArgs(input.url, options),
					{ signal: input.signal, timeoutMs: options.timeoutMs },
				);
				return parseProbe(stdout);
			} catch (error) {
				throw toUserFacing(ctx, error, "reading the track's details");
			}
		},

		/**
		 * `yt-dlp | ffmpeg` → MP3 bytes. The returned stream only ends once both
		 * processes exited cleanly; otherwise it's destroyed with the reason, so a
		 * half-downloaded track can never pass as complete. Destroying it (or
		 * aborting `signal`) kills both process groups.
		 */
		streamMp3(input: YtDlpState & { signal: AbortSignal }): Readable {
			const out = new PassThrough();
			const local = new AbortController();
			const signal = AbortSignal.any([input.signal, local.signal]);
			out.once("close", () => local.abort());

			const ytDlp = ctx.spawnStream(options.bin, streamArgs(options), {
				stdin: input.infoJson,
				signal,
				timeoutMs: options.timeoutMs,
			});
			const ffmpeg = ctx.spawnStream(
				options.ffmpegBin,
				ffmpegArgs(input.sourceCodec),
				{
					stdin: ytDlp.stdout,
					signal,
					timeoutMs: options.timeoutMs,
				},
			);
			ffmpeg.stdout.pipe(out, { end: false });

			void Promise.allSettled([ytDlp.done, ffmpeg.done]).then(
				([download, convert]) => {
					if (
						download.status === "fulfilled" &&
						convert.status === "fulfilled"
					) {
						out.end();
					} else if (download.status === "rejected") {
						// yt-dlp's reason explains the failure; ffmpeg just saw its input end.
						out.destroy(
							asError(
								toUserFacing(ctx, download.reason, "downloading the audio"),
							),
						);
					} else if (convert.status === "rejected") {
						out.destroy(asError(convert.reason));
					}
				},
			);
			return out;
		},

		async version(): Promise<string> {
			const { stdout } = await ctx.run(options.bin, ["--version"], {
				timeoutMs: 10_000,
			});
			return stdout.trim();
		},
	};
}

function asError(value: unknown): Error {
	return value instanceof Error ? value : new Error(String(value));
}
