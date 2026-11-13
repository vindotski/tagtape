/**
 * The built-in source: a direct link to an MP3 file on a public web server.
 *
 * - `match`: http(s) links whose path ends in `.mp3`.
 * - `probe`: downloads only the ID3 tag and a few KB after it, which proves
 *   the file is MP3 and tells its length (no audio is fetched).
 * - `stream`: the file through ffmpeg, which drops its tags. CBR files are
 *   copied as is; VBR files are re-encoded to CBR, because a streamed file
 *   can't carry a correct VBR (Xing) header and players would show the wrong
 *   length.
 *
 * Every request goes through `openPublicUrl` (no private addresses, capped
 * redirects), and the download is capped in size. Nothing touches the disk.
 */
import type { IncomingMessage } from "node:http";
import type { LookupFunction } from "node:net";
import { PassThrough, pipeline, type Readable, Transform } from "node:stream";
import { MAX_TRACK_SECONDS } from "@tagtape/shared";
import { UserFacingError } from "../lib/errors.ts";
import { spawnStream as realSpawnStream } from "../lib/exec.ts";
import { openPublicUrl } from "../lib/http.ts";
import type { Source, TrackProbe } from "../plugins/api.ts";
import { HEADER_WINDOW, id3v2Size, readMp3Info } from "./mp3.ts";

const LABEL = "Track link";
/** How long a server may take to start answering (headers). */
const CONNECT_TIMEOUT_MS = 30_000;
/** How long the body may stall (no bytes at all) before the track fails. */
const IDLE_TIMEOUT_MS = 60_000;
/**
 * Embedded artwork can make tags big. The tag is skipped (counted, not kept),
 * so this only bounds how much a check downloads.
 */
const MAX_TAG_BYTES = 8 * 1024 * 1024;
/** Re-encoding bitrate for VBR files (same as the site sources). */
const MP3_BITRATE = "256k";

/** Content types an MP3 may be served with (some servers send none). */
const MP3_TYPES = new Set([
	"",
	"audio/mpeg",
	"audio/mp3",
	"audio/mpeg3",
	"audio/x-mpeg",
	"audio/x-mpeg-3",
	"audio/x-mp3",
	"application/octet-stream",
	"binary/octet-stream",
]);

export interface DirectSourceOptions {
	ffmpegBin: string;
	maxBytes: number;
	/** Kill a single conversion after this long. */
	timeoutMs: number;
	/** For tests: DNS lookup that doesn't block local servers. */
	lookup?: LookupFunction;
	/** For tests: replaces ffmpeg. */
	spawnStream?: typeof realSpawnStream;
	/** For tests: the port of a local test server. */
	testPort?: string;
	/** For tests: a smaller output cap. */
	maxOutputBytes?: number;
	/** For tests: shorter timeouts. */
	connectTimeoutMs?: number;
	idleTimeoutMs?: number;
}

interface DirectState {
	url: string;
	vbr: boolean;
}

export function createDirectSource(options: DirectSourceOptions): Source {
	const spawnStream = options.spawnStream ?? realSpawnStream;

	async function open(url: string, signal: AbortSignal) {
		// The connect timeout covers only the wait for the response headers. It
		// must not stay attached to the request: its signal would also abort the
		// body, killing every transfer that takes longer than the timeout.
		const connect = new AbortController();
		const timer = setTimeout(
			() => connect.abort(),
			options.connectTimeoutMs ?? CONNECT_TIMEOUT_MS,
		);
		let response: IncomingMessage;
		try {
			response = await openPublicUrl(url, {
				signal: AbortSignal.any([signal, connect.signal]),
				accept: "audio/mpeg, */*;q=0.5",
				label: LABEL,
				...(options.lookup ? { lookup: options.lookup } : {}),
				...(options.testPort ? { testPort: options.testPort } : {}),
			});
		} catch (error) {
			if (connect.signal.aborted && !signal.aborted) {
				throw new UserFacingError("The track link didn't answer in time");
			}
			throw error;
		} finally {
			clearTimeout(timer);
		}
		// From here on, only a body that stops moving fails the track.
		response.setTimeout(options.idleTimeoutMs ?? IDLE_TIMEOUT_MS, () => {
			response.destroy(
				new UserFacingError("The track link stopped sending data"),
			);
		});
		const type = (response.headers["content-type"] ?? "")
			.split(";")[0]
			?.trim()
			.toLowerCase();
		if (!MP3_TYPES.has(type ?? "")) {
			response.destroy();
			throw notMp3();
		}
		const length = Number(response.headers["content-length"]);
		const totalBytes = Number.isFinite(length) && length > 0 ? length : null;
		if (totalBytes !== null && totalBytes > options.maxBytes) {
			response.destroy();
			throw tooLarge(options.maxBytes);
		}
		return { response, totalBytes };
	}

	return {
		id: "direct",
		name: "MP3 links",
		match(url) {
			if (!url.pathname.toLowerCase().endsWith(".mp3")) return null;
			const canonical = new URL(url);
			canonical.hash = "";
			return canonical.href;
		},

		async probe({ url, signal }): Promise<TrackProbe> {
			const { response, totalBytes } = await open(url, signal);
			const { head, skipped } = await readHead(response);
			const info = readMp3Info(head, totalBytes, skipped);
			if (!info) throw notMp3();
			const state: DirectState = { url, vbr: info.vbr };
			return {
				title: fileTitle(url),
				durationSeconds: info.durationSeconds,
				isLive: false,
				state,
			};
		},

		stream({ state, signal }): Readable {
			const { url, vbr } = state as DirectState;
			const out = new PassThrough();
			const local = new AbortController();
			const both = AbortSignal.any([signal, local.signal]);
			out.once("close", () => local.abort());

			open(url, both)
				.then(async ({ response }) => {
					// `pipeline`, not `pipe`: a connection that drops must end ffmpeg's
					// input too, or ffmpeg would wait for more bytes until its timeout.
					let settleInput: (error: Error | null | undefined) => void = () => {};
					const inputDone = new Promise<Error | null | undefined>((resolve) => {
						settleInput = resolve;
					});
					const input = pipeline(
						response,
						capBytes(options.maxBytes),
						settleInput,
					);
					const ffmpeg = spawnStream(options.ffmpegBin, ffmpegArgs(vbr), {
						stdin: input,
						signal: both,
						timeoutMs: options.timeoutMs,
					});
					// The input is capped, but a re-encode can still grow (or a file can
					// lie about its length): cap what goes out too.
					const output = ffmpeg.stdout.pipe(capBytes(maxOutputBytes(options)));
					// Closing `out` aborts `local`, which kills ffmpeg.
					output.once("error", (error) => out.destroy(error));
					output.pipe(out, { end: false });
					await ffmpeg.done;

					// ffmpeg exits cleanly when its input simply ends, so a download that
					// was cut off (or went over the cap) must be caught here: a truncated
					// track must never pass as complete. Wait for the input to settle so
					// the real reason (e.g. the size cap) is known.
					if (!response.complete) response.destroy();
					const inputError = await inputDone;
					if (inputError instanceof UserFacingError) throw inputError;
					if (inputError || !response.complete) {
						throw new UserFacingError(
							"The download of this track was cut off. Try again.",
							inputError ? { cause: inputError } : undefined,
						);
					}
				})
				.then(
					() => out.end(),
					(error: unknown) =>
						out.destroy(
							error instanceof Error ? error : new Error(String(error)),
						),
				);
			return out;
		},
	};
}

/**
 * MP3 in, MP3 out, no tags, no Xing header (we write the only tag, and a
 * header written before the end of a stream would be wrong). `-f mp3` on the
 * input refuses anything that isn't MP3.
 */
export function ffmpegArgs(vbr: boolean): string[] {
	return [
		"-hide_banner",
		"-loglevel",
		"error",
		// Read only from stdin: never let a crafted file make ffmpeg open
		// other protocols (files, URLs).
		"-protocol_whitelist",
		"pipe",
		"-f",
		"mp3",
		"-i",
		"pipe:0",
		"-map",
		"0:a:0",
		"-map_metadata",
		"-1",
		...(vbr ? ["-c:a", "libmp3lame", "-b:a", MP3_BITRATE] : ["-c:a", "copy"]),
		// Never more than the longest track we accept, whatever the file claims.
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

/**
 * The bytes right after the ID3v2 tag (`HEADER_WINDOW` of them), then stops
 * the download. The tag itself is skipped, not buffered: a big embedded cover
 * costs download time but no memory.
 */
async function readHead(
	response: IncomingMessage,
): Promise<{ head: Buffer; skipped: number }> {
	let start = Buffer.alloc(0);
	let skipped: number | undefined;
	let seen = 0;
	const kept: Buffer[] = [];
	let keptBytes = 0;
	try {
		for await (const piece of response) {
			let chunk = piece as Buffer;
			if (skipped === undefined) {
				start = Buffer.concat([start, chunk]);
				if (start.length < 10) continue;
				skipped = id3v2Size(start);
				if (skipped > MAX_TAG_BYTES) throw notMp3();
				chunk = start;
				seen = 0;
			}
			// Drop whatever still belongs to the tag, keep the rest.
			const tagLeft = Math.max(0, skipped - seen);
			seen += chunk.length;
			if (tagLeft >= chunk.length) continue;
			const rest = chunk.subarray(tagLeft);
			kept.push(rest);
			keptBytes += rest.length;
			if (keptBytes >= HEADER_WINDOW) break;
		}
	} catch (error) {
		if (error instanceof UserFacingError) throw error;
		throw new UserFacingError("Couldn't read the MP3 file");
	} finally {
		response.destroy();
	}
	if (skipped === undefined) return { head: start, skipped: 0 };
	return { head: Buffer.concat(kept), skipped };
}

/** Output cap: the input cap plus room for re-encoding up to 2 hours at 320 kbps. */
function maxOutputBytes(options: DirectSourceOptions): number {
	if (options.maxOutputBytes) return options.maxOutputBytes;
	return Math.max(options.maxBytes, (MAX_TRACK_SECONDS * 320_000) / 8) * 1.1;
}

/** Fails the stream once more than `maxBytes` came through. */
function capBytes(maxBytes: number): Transform {
	let total = 0;
	return new Transform({
		transform(chunk: Buffer, _encoding, callback) {
			total += chunk.length;
			callback(total > maxBytes ? tooLarge(maxBytes) : null, chunk);
		},
	});
}

/** "…/Night%20Drive.mp3" → "Night Drive". */
function fileTitle(url: string): string {
	const name = new URL(url).pathname.split("/").pop() ?? "";
	try {
		return decodeURIComponent(name).replace(/\.mp3$/i, "");
	} catch {
		return name;
	}
}

function notMp3(): UserFacingError {
	return new UserFacingError("This link doesn't point to an MP3 file");
}

function tooLarge(maxBytes: number): UserFacingError {
	return new UserFacingError(
		`The MP3 file is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`,
	);
}
