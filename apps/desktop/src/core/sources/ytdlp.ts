/**
 * The built-in site source: single tracks from any site yt-dlp has an
 * extractor for, converted to MP3 with ffmpeg, with nothing on disk.
 *
 * - `match`: any public http(s) link (it's tried after the stricter sources).
 *   yt-dlp decides at the check whether one of its extractors claims it.
 * - Never the `generic` extractor (`--use-extractors default,-generic`), so
 *   arbitrary web pages are never read.
 * - Every request yt-dlp (and the ffmpeg it starts for HLS) makes goes
 *   through the egress proxy (`lib/egress-proxy.ts`): public addresses only.
 * - No cookies, no logins, and never anything that gets around DRM.
 * - At most `maxChecks` yt-dlp checks run at once (each is a Python process
 *   of ~100 MB). Downloads aren't counted: `MAX_ACTIVE_STREAMS` caps them,
 *   and a shared cap would let two long downloads starve every album check.
 * - When a site's anti-bot check or rate limit refuses this device, that site
 *   is paused for `cooldownMs`: its links fail at once with a "try again"
 *   message instead of each asking yt-dlp to be refused again. TagTape never
 *   uses cookies, accounts, token helpers or rotating proxies to get past it.
 */
import { isIP } from "node:net";
import { PassThrough, type Readable } from "node:stream";
import {
	describeYtDlpFailure,
	isBlockedStderr,
	MAX_TRACK_SECONDS,
	pausedMessage,
	siteKey,
	UNSUPPORTED_LINK,
} from "@tagtape/shared";
import { Semaphore } from "../jobs/queue.ts";
import { UserFacingError } from "../lib/errors.ts";
import {
	ExecError,
	run as realRun,
	spawnStream as realSpawnStream,
} from "../lib/exec.ts";
import type { Source, TrackProbe } from "../plugins/api.ts";

export interface YtDlpOptions {
	bin: string;
	ffmpegBin: string;
	/** Runtime for sites' JavaScript challenges (`--js-runtimes`); empty disables it. */
	jsRuntime: string;
	/** Variables yt-dlp's own children need (e.g. to run the JS runtime). */
	env?: Readonly<Record<string, string>>;
	/** The egress proxy's URL. */
	proxy: string;
	/** Kill a single yt-dlp run after this long. */
	timeoutMs: number;
	/** yt-dlp checks (probes) running at once. Downloads are capped by the job manager. */
	maxChecks: number;
	/** How long a site stays paused after it refused this device; 0 never pauses. */
	cooldownMs?: number;
	/** Where the start of a pause is reported (the app's log). */
	log?: { warn(obj: object, msg: string): void };
	/** For tests: the clock. */
	now?: () => number;
	/** For tests: replace the process runners. */
	run?: typeof realRun;
	spawnStream?: typeof realSpawnStream;
}

/** MP3 bitrate. Constant, because a stream can't go back to write a VBR header. */
export const MP3_BITRATE = "256k";

/** Every extractor yt-dlp has, except the one that reads arbitrary pages. */
export const EXTRACTORS = "default,-generic";

/**
 * Same format choice for the probe and the stream, so the probe's checks hold.
 * Never DASH: yt-dlp downloads DASH fragments to temporary files even when
 * writing to stdout, and ffmpeg can't take them over. A DASH-only track fails
 * the check.
 */
export const FORMAT = "bestaudio[protocol!*=dash]/best[protocol!*=dash]";

/**
 * Flags every run gets: no config files, no plugins from the user's own
 * yt-dlp folders (an extractor or token helper installed there must not
 * change what this app does), no cache on disk, the proxy.
 */
function baseArgs(options: YtDlpOptions): string[] {
	const args = [
		"--ignore-config",
		"--no-plugin-dirs",
		"--no-warnings",
		"--no-cache-dir",
		"--use-extractors",
		EXTRACTORS,
		"--proxy",
		options.proxy,
	];
	if (options.jsRuntime) args.push("--js-runtimes", options.jsRuntime);
	return args;
}

/**
 * Metadata only. `--flat-playlist` keeps a playlist link from resolving every
 * entry (it's refused anyway). `--` ends option parsing, so a URL can never be
 * read as a flag.
 */
export function probeArgs(url: string, options: YtDlpOptions): string[] {
	return [
		...baseArgs(options),
		"--no-playlist",
		"--flat-playlist",
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
 * fetch and nothing written to disk. HLS goes through ffmpeg: yt-dlp's native
 * HLS downloader crashes when writing to stdout. yt-dlp hands `--proxy` on to
 * that ffmpeg.
 *
 * The info JSON path is `-`, not `/dev/stdin`: Node connects a child's stdin
 * with a socket pair, and opening `/dev/stdin` on a socket fails with ENXIO.
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
 * wrong values. MP3 audio is copied, anything else re-encoded to CBR.
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
		"-protocol_whitelist",
		"pipe",
		"-i",
		"pipe:0",
		"-vn",
		"-map_metadata",
		"-1",
		...codec,
		"-t",
		String(MAX_TRACK_SECONDS),
		"-threads",
		"1",
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

/** True when the site refused this device (bot check, rate limit), not the track. */
export function isBlockedFailure(error: unknown): boolean {
	const cause = error instanceof UserFacingError ? error.cause : error;
	return cause instanceof ExecError && isBlockedStderr(cause.stderr);
}

function toUserFacing(error: unknown, action: string): unknown {
	if (error instanceof ExecError) {
		if (error.timedOut) {
			return new UserFacingError(`Timed out while ${action}`);
		}
		if (error.exitCode === null) return error; // couldn't even start yt-dlp: a broken install, not the link
		// Keep the original (with yt-dlp's stderr) as the cause, for the logs.
		return new UserFacingError(describeYtDlpFailure(error.stderr), {
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
	/** `siteKey` of the link, so a refused download pauses its site too. */
	site?: string;
}

interface YtDlpInfo {
	_type?: unknown;
	title?: unknown;
	duration?: unknown;
	is_live?: unknown;
	live_status?: unknown;
	acodec?: unknown;
}

export function parseProbe(json: string): TrackProbe & { state: YtDlpState } {
	const info = JSON.parse(json) as YtDlpInfo;
	if (info._type === "playlist" || info._type === "multi_video") {
		throw new UserFacingError(
			"This link is a playlist or a set: link to a single track",
		);
	}
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

/**
 * Any public http(s) link: no IP literals and no single-label or `.localhost`
 * hosts (the proxy would refuse them anyway; this says so at once).
 */
export function matchSiteUrl(url: URL): string | null {
	const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
	if (isIP(host)) return null;
	if (!host.includes(".") || host.endsWith(".localhost")) return null;
	if (host.endsWith(".local") || host.endsWith(".internal")) return null;
	return url.href;
}

export function createYtDlpSource(options: YtDlpOptions): Source {
	const run = options.run ?? realRun;
	const spawnStream = options.spawnStream ?? realSpawnStream;
	const checks = new Semaphore(options.maxChecks);
	const now = options.now ?? Date.now;
	const cooldownMs = options.cooldownMs ?? 0;
	/** Site → when it may be tried again. A handful of entries at most. */
	const pausedUntil = new Map<string, number>();

	function pauseIfBlocked(site: string | undefined, error: unknown): void {
		if (!site || cooldownMs <= 0 || !isBlockedFailure(error)) return;
		const at = now();
		for (const [key, until] of pausedUntil) {
			if (until <= at) pausedUntil.delete(key);
		}
		if (pausedUntil.has(site)) return; // already paused: logged once
		pausedUntil.set(site, at + cooldownMs);
		options.log?.warn(
			{ site, until: new Date(at + cooldownMs).toISOString() },
			"Site refused this device (bot check or rate limit): pausing it",
		);
	}

	/** Throws the "try again" message while a site is paused. */
	function checkNotPaused(site: string): void {
		const until = pausedUntil.get(site);
		if (until === undefined) return;
		const left = until - now();
		if (left <= 0) {
			pausedUntil.delete(site);
			return;
		}
		throw new UserFacingError(pausedMessage(left));
	}

	/**
	 * `yt-dlp | ffmpeg` → MP3 bytes. The returned stream only ends once both
	 * processes exited cleanly; otherwise it's destroyed with the reason, so a
	 * half-downloaded track can never pass as complete. Destroying it (or
	 * aborting `signal`) kills both process groups.
	 */
	function streamMp3(state: YtDlpState, outerSignal: AbortSignal): Readable {
		const out = new PassThrough();
		const local = new AbortController();
		const signal = AbortSignal.any([outerSignal, local.signal]);
		out.once("close", () => local.abort());

		void (async () => {
			const ytDlp = spawnStream(options.bin, streamArgs(options), {
				stdin: state.infoJson,
				signal,
				timeoutMs: options.timeoutMs,
				...(options.env ? { env: options.env } : {}),
			});
			const ffmpeg = spawnStream(
				options.ffmpegBin,
				ffmpegArgs(state.sourceCodec),
				{ stdin: ytDlp.stdout, signal, timeoutMs: options.timeoutMs },
			);
			ffmpeg.stdout.pipe(out, { end: false });

			const [download, convert] = await Promise.allSettled([
				ytDlp.done,
				ffmpeg.done,
			]);
			if (download.status === "fulfilled" && convert.status === "fulfilled") {
				out.end();
			} else if (download.status === "rejected") {
				pauseIfBlocked(state.site, download.reason);
				// yt-dlp's reason explains the failure; ffmpeg just saw its input end.
				out.destroy(
					asError(toUserFacing(download.reason, "downloading the audio")),
				);
			} else if (convert.status === "rejected") {
				out.destroy(asError(convert.reason));
			}
		})();
		return out;
	}

	return {
		id: "ytdlp",
		name: "sites supported by yt-dlp",
		match: matchSiteUrl,
		async probe({ url, signal }) {
			const site = siteKey(url);
			checkNotPaused(site);
			const release = await checks.acquire(signal);
			let stdout: string;
			try {
				({ stdout } = await run(options.bin, probeArgs(url, options), {
					signal,
					timeoutMs: options.timeoutMs,
					...(options.env ? { env: options.env } : {}),
				}));
			} catch (error) {
				pauseIfBlocked(site, error);
				throw toUserFacing(error, "reading the track's details");
			} finally {
				release();
			}
			try {
				const probe = parseProbe(stdout);
				return { ...probe, state: { ...probe.state, site } };
			} catch (error) {
				if (error instanceof UserFacingError) throw error;
				throw new UserFacingError(UNSUPPORTED_LINK, { cause: error });
			}
		},
		stream: ({ state, signal }) => streamMp3(state as YtDlpState, signal),
		async version() {
			const { stdout } = await run(options.bin, ["--version"], {
				timeoutMs: 10_000,
			});
			return stdout.trim();
		},
	};
}

function asError(value: unknown): Error {
	return value instanceof Error ? value : new Error(String(value));
}
