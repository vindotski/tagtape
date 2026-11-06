import type { Config } from "../config.ts";
import { run } from "../lib/exec.ts";
import { fetchCover } from "./cover.ts";
import type { Pipeline } from "./types.ts";
import { createYtDlp } from "./ytdlp.ts";

/** The real pipeline: yt-dlp + ffmpeg (streamed) + sharp. */
export function createPipeline(config: Config): Pipeline {
	const ytDlp = createYtDlp({
		bin: config.YTDLP_BIN,
		ffmpegBin: config.FFMPEG_BIN,
		jsRuntime: config.YTDLP_JS_RUNTIME,
		timeoutMs: config.YTDLP_TIMEOUT_SEC * 1000,
	});

	return {
		probe: ytDlp.probe,
		streamMp3: ytDlp.streamMp3,
		fetchCover,
		async versions() {
			const [ytDlpVersion, ffmpeg] = await Promise.all([
				ytDlp.version(),
				run(config.FFMPEG_BIN, ["-version"], { timeoutMs: 10_000 }),
			]);
			return {
				ytDlp: ytDlpVersion,
				ffmpeg: ffmpeg.stdout.split("\n")[0]?.trim() ?? "",
			};
		},
	};
}

export type { Pipeline } from "./types.ts";
