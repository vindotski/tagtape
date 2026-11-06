import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

const positiveInt = (fallback: number) =>
	z.coerce.number().int().positive().default(fallback);

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
	/** Root for per-job working directories. Wiped on startup. */
	TMP_DIR: z.string().default(join(tmpdir(), "tagtape")),
	/** Minutes a finished job (and its ZIP) stays available. */
	JOB_TTL_MIN: positiveInt(30),
	/** Jobs processed at the same time. */
	MAX_ACTIVE_JOBS: positiveInt(2),
	/** Jobs allowed to wait for a slot before POST /jobs answers 429. */
	MAX_QUEUED_JOBS: positiveInt(20),
	/** Tracks downloaded in parallel within one job. */
	TRACK_CONCURRENCY: positiveInt(2),
	/** Kill a single yt-dlp run after this many seconds. */
	YTDLP_TIMEOUT_SEC: positiveInt(300),
	YTDLP_BIN: z.string().min(1).default("yt-dlp"),
	/**
	 * JavaScript runtime yt-dlp uses to solve YouTube's player challenges
	 * (`--js-runtimes`). Node is already present, so reuse it. Empty disables the flag.
	 */
	YTDLP_JS_RUNTIME: z.string().default("node"),
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
