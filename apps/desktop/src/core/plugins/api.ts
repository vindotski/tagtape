/**
 * The source plugin contract: how TagTape learns to read tracks from a site.
 *
 * A plugin is an ES module (TypeScript is fine: Node strips the types) whose
 * default export is a `TagTapePlugin`. List plugin files in `TAGTAPE_PLUGINS`
 * (comma-separated; relative paths resolve against the working directory).
 * The API imports them at startup and refuses to start if one is invalid.
 *
 * Plugins get everything they need from TagTape through `PluginContext`, so
 * they never import TagTape's files at runtime (only these types). The core
 * does the rest: limits, cover, ID3 tags, the streamed ZIP, the job queue.
 *
 * This file depends on nothing but Node's types, so a plugin kept in another
 * repository can copy it verbatim for type checking.
 */
import type { Readable } from "node:stream";

/** Bumped when the contract changes incompatibly. */
export const PLUGIN_API_VERSION = 1;

export interface TagTapePlugin {
	apiVersion: typeof PLUGIN_API_VERSION;
	/** For logs and errors, e.g. "example-sources". */
	name: string;
	create(ctx: PluginContext): Source[] | Promise<Source[]>;
}

export interface PluginContext {
	/** The process environment, for the plugin's own settings. */
	env: Readonly<Record<string, string | undefined>>;
	/** The ffmpeg binary TagTape uses. */
	ffmpegBin: string;
	/** Run a binary and collect its output: argument array, never a shell. */
	run(
		command: string,
		args: readonly string[],
		options?: { signal?: AbortSignal; timeoutMs?: number },
	): Promise<{ stdout: string; stderr: string }>;
	/**
	 * Run a binary and stream its stdout (backpressure applies). `done` settles
	 * when it exits: resolves on exit code 0, rejects with an `ExecError` or an
	 * `AbortError`. Aborting `signal` or the timeout kills the process group.
	 */
	spawnStream(
		command: string,
		args: readonly string[],
		options: {
			signal: AbortSignal;
			stdin?: string | Readable;
			timeoutMs?: number;
		},
	): { stdout: Readable; done: Promise<void> };
	/** Thrown by `run` / `spawnStream` (non-zero exit, timeout, failed start). */
	ExecError: abstract new (
		...args: never[]
	) => ExecErrorLike;
	/** Throw (or destroy a stream with) one of these to show the user a message. */
	UserFacingError: new (
		message: string,
		options?: ErrorOptions,
	) => Error;
	log: {
		info(obj: object, msg: string): void;
		warn(obj: object, msg: string): void;
		error(obj: object, msg: string): void;
	};
}

export interface ExecErrorLike extends Error {
	/** `null` when the process never started, was killed, or timed out. */
	exitCode: number | null;
	/** The last few KB of the process's stderr. */
	stderr: string;
	timedOut: boolean;
}

/** One kind of link TagTape can turn into an MP3, e.g. one website. */
export interface Source {
	/** Stable, unique id: lowercase letters, digits and dashes. */
	id: string;
	/** Shown to users, e.g. "Example Music". */
	name: string;
	/**
	 * The canonical URL for a link this source handles, or `null`. Be strict:
	 * accept single tracks only, never arbitrary pages. Sources are tried in
	 * order and the first match wins.
	 */
	match(url: URL): string | null;
	/** Reads a track's details without downloading the audio. */
	probe(input: { url: string; signal: AbortSignal }): Promise<TrackProbe>;
	/**
	 * The track as MP3 bytes with no tags (TagTape writes the only ID3 tag).
	 * The stream ends only on success; on failure it's destroyed with the
	 * reason. Aborting `signal` must stop all work. Never write audio to disk.
	 */
	stream(input: { state: unknown; signal: AbortSignal }): Readable;
	/** Version of whatever the source runs, for `/health`. */
	version?(): Promise<string>;
}

export interface TrackProbe {
	title: string;
	/** Seconds, or `null` when unknown (such tracks are rejected). */
	durationSeconds: number | null;
	/** Live or upcoming streams can't be converted. */
	isLive: boolean;
	/** Anything `stream` needs later; kept in memory with the job. */
	state: unknown;
}
