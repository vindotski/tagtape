/**
 * Site sources plugin: single-track links from the sites in `SUPPORTED_SITES`,
 * fetched with yt-dlp and converted with ffmpeg, streamed with nothing on disk.
 *
 * Self-contained on purpose: it uses only Node built-ins, files in this
 * folder, and what TagTape hands it through the plugin context.
 *
 * Settings (environment):
 *   YTDLP_BIN          yt-dlp binary (default "yt-dlp")
 *   YTDLP_JS_RUNTIME   runtime for YouTube's player challenges (default "node"; empty disables)
 *   YTDLP_TIMEOUT_SEC  kill a single yt-dlp run after this long (default 1800)
 */
import type {
	PluginContext,
	Source,
	TagTapePlugin,
} from "../../plugins/api.ts";
import { parseTrackUrl, SUPPORTED_SITES } from "./sites.ts";
import { createYtDlp, type YtDlpState } from "./ytdlp.ts";

export function settings(env: PluginContext["env"]) {
	const timeout = Number(env.YTDLP_TIMEOUT_SEC ?? "1800");
	if (!Number.isInteger(timeout) || timeout <= 0) {
		throw new Error("YTDLP_TIMEOUT_SEC must be a positive whole number");
	}
	return {
		bin: env.YTDLP_BIN || "yt-dlp",
		jsRuntime: env.YTDLP_JS_RUNTIME ?? "node",
		timeoutMs: timeout * 1000,
	};
}

const plugin: TagTapePlugin = {
	apiVersion: 1,
	name: "sites",
	create(ctx) {
		const ytDlp = createYtDlp(
			{ ...settings(ctx.env), ffmpegBin: ctx.ffmpegBin },
			ctx,
		);
		// Every site runs the same yt-dlp: one `--version` per health check, not one per site.
		let pending: Promise<string> | undefined;
		const version = () => {
			pending ??= ytDlp.version().finally(() => {
				pending = undefined;
			});
			return pending;
		};
		return SUPPORTED_SITES.map(
			(site): Source => ({
				id: site.id,
				name: site.name,
				match(url) {
					const parsed = parseTrackUrl(url.href);
					return parsed?.site === site.id ? parsed.url : null;
				},
				probe: ytDlp.probe,
				stream: ({ state, signal }) =>
					ytDlp.streamMp3({ ...(state as YtDlpState), signal }),
				version,
			}),
		);
	},
};

export default plugin;
