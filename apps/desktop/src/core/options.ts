/** Where log lines go (pino's shape: an object, then a message). */
export interface Logger {
	info(obj: object, msg: string): void;
	warn(obj: object, msg: string): void;
	error(obj: object, msg: string): void;
}

export interface TagTapeOptions {
	/** Absolute path to ffmpeg (it must have libmp3lame). */
	ffmpegBin: string;
	/** Absolute path to yt-dlp. Without it, only direct MP3 links (and plugins) work. */
	ytdlpBin?: string;
	/**
	 * Runtime for sites' JavaScript challenges (yt-dlp's `--js-runtimes`), as
	 * `name:path`, and the variables it needs to run.
	 */
	jsRuntime?: string;
	jsRuntimeEnv?: Readonly<Record<string, string>>;
	/** Source plugins to load: absolute paths to their modules. */
	plugins?: string[];
	/** What plugins may read as their environment. */
	pluginEnv?: NodeJS.ProcessEnv;
	log: Logger;
}

/**
 * Fixed limits. One person uses the app, so these only keep a big album from
 * starting everything at once. Checks and downloads have separate caps on
 * purpose: long downloads must not starve the checks.
 */
export const LIMITS = {
	/** How long a finished job is remembered. */
	jobTtlMs: 30 * 60_000,
	maxActiveProbes: 4,
	maxQueuedJobs: 20,
	/** Albums converting at once (each runs its source's tools + ffmpeg). */
	maxActiveStreams: 2,
	maxStoredJobs: 100,
	/** A job's whole check (every track and the cover) must finish within this. */
	checkTimeoutMs: 180_000,
	/** Tracks checked in parallel within one job. */
	trackConcurrency: 2,
	/** Largest MP3 a direct link may point to (≈ 2 hours at 320 kbps). */
	maxDirectBytes: 300 * 1024 * 1024,
	/** Kill a single source run (yt-dlp, or a direct download) after this long. */
	sourceTimeoutMs: 30 * 60_000,
	/** yt-dlp checks at once (~100 MB each). */
	ytdlpMaxChecks: 3,
	/** How long a site stays paused after its bot check or rate limit refused us. */
	ytdlpCooldownMs: 10 * 60_000,
} as const;
