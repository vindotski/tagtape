import { z } from "zod";

const positiveInt = (fallback: number) =>
	z.coerce.number().int().positive().default(fallback);
/** Queue sizes: 0 means "never wait, answer 429 right away". */
const queueSize = (fallback: number) =>
	z.coerce.number().int().min(0).default(fallback);

/**
 * All configuration comes from environment variables, validated once at startup.
 * No config files and no NODE_ENV branching (see the fastify-best-practices skill).
 */
export const configSchema = z.object({
	PORT: z.coerce.number().int().min(0).max(65535).default(4000),
	/** Localhost by default; the Docker image sets 0.0.0.0. */
	HOST: z.string().default("127.0.0.1"),
	LOG_LEVEL: z
		.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
		.default("info"),
	/** Shared secret the web app sends as `Authorization: Bearer …`. */
	API_TOKEN: z
		.string()
		.min(32, { error: "API_TOKEN must be at least 32 characters" }),
	/** Minutes a checked or finished job can still be downloaded (again). */
	JOB_TTL_MIN: positiveInt(30),
	/** Jobs whose tracks are checked at the same time (metadata only, light). */
	MAX_ACTIVE_PROBES: positiveInt(4),
	/** Jobs allowed to wait for a check before POST /jobs answers 429. */
	MAX_QUEUED_JOBS: queueSize(20),
	/** Downloads converting at the same time (each runs its source's tools + ffmpeg). */
	MAX_ACTIVE_STREAMS: positiveInt(2),
	/** Downloads allowed to wait for a slot before the archive route answers 429. */
	MAX_QUEUED_STREAMS: queueSize(10),
	/** Downloads one job may start; after that the album must be converted again. */
	MAX_DOWNLOADS_PER_JOB: positiveInt(5),
	/** Jobs kept in memory at once (any status, until they expire). */
	MAX_STORED_JOBS: positiveInt(500),
	/** Seconds a job's whole check (every track and the cover) may take. */
	CHECK_TIMEOUT_SEC: positiveInt(180),
	/** Per client (the browser's IP, IPv6 per /64): albums started per hour… */
	MAX_JOBS_PER_CLIENT_HOUR: positiveInt(30),
	/** …albums being checked at once… */
	MAX_CHECKING_JOBS_PER_CLIENT: positiveInt(2),
	/** …and downloads running or waiting at once. */
	MAX_DOWNLOADS_PER_CLIENT: positiveInt(2),
	/** Tracks checked in parallel within one job. */
	TRACK_CONCURRENCY: positiveInt(2),
	/** Largest MP3 file a direct link may point to, in MB (300 MB ≈ 2 hours at 320 kbps). */
	MAX_DIRECT_MB: positiveInt(300),
	/**
	 * Source plugins to load: absolute paths to their modules, comma-separated.
	 * Each plugin reads its own settings from the environment.
	 */
	TAGTAPE_PLUGINS: z.string().default(""),
	FFMPEG_BIN: z.string().min(1).default("ffmpeg"),
	/** Release of the web + API image (set at Docker build time). */
	TAGTAPE_VERSION: z.string().min(1).default("dev"),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
	const result = configSchema.safeParse(env);
	if (!result.success) {
		const problems = result.error.issues
			.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
			.join("\n");
		throw new Error(`Invalid configuration:\n${problems}`);
	}
	return result.data;
}
