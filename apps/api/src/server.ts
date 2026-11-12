import closeWithGrace from "close-with-grace";
import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { type EgressProxy, startEgressProxy } from "./lib/egress-proxy.ts";
import { UserFacingError } from "./lib/errors.ts";
import { ExecError, run, spawnStream } from "./lib/exec.ts";
import { createPipeline } from "./pipeline/index.ts";
import { loadPlugins, pluginPaths } from "./plugins/loader.ts";
import { createDirectSource } from "./sources/direct.ts";
import { createYtDlpSource } from "./sources/ytdlp.ts";

const config = loadConfig();
let egressProxy: EgressProxy | undefined;
const app = await buildApp({
	config,
	// Built after the app so plugins log through Fastify's logger.
	pipeline: async (log) => {
		// Plugins read their own settings from the environment, minus the API's secret.
		const { API_TOKEN: _token, ...pluginEnv } = process.env;
		const plugins = await loadPlugins(pluginPaths(config.TAGTAPE_PLUGINS), {
			env: pluginEnv,
			ffmpegBin: config.FFMPEG_BIN,
			run,
			spawnStream,
			ExecError,
			UserFacingError,
			log,
		});
		// Plugins are tried first, then direct MP3 links (strict and cheap),
		// then yt-dlp, which takes any other public link.
		const sources = [
			...plugins,
			createDirectSource({
				ffmpegBin: config.FFMPEG_BIN,
				maxBytes: config.MAX_DIRECT_MB * 1024 * 1024,
				timeoutMs: 30 * 60_000,
			}),
		];
		if (config.YTDLP_BIN) {
			// yt-dlp fetches links itself: everything it (and its ffmpeg) opens
			// goes through this proxy, which refuses private addresses.
			egressProxy = await startEgressProxy({ log });
			sources.push(
				createYtDlpSource({
					bin: config.YTDLP_BIN,
					ffmpegBin: config.FFMPEG_BIN,
					jsRuntime: config.YTDLP_JS_RUNTIME,
					proxy: egressProxy.url,
					timeoutMs: config.YTDLP_TIMEOUT_SEC * 1000,
					maxProcesses: config.YTDLP_MAX_PROCESSES,
				}),
			);
		}
		return createPipeline(config, sources);
	},
});

// SIGINT/SIGTERM or a crash: stop accepting requests, cancel running jobs.
closeWithGrace({ delay: 10_000 }, async ({ signal, err }) => {
	if (err) app.log.error({ err }, "Shutting down after an error");
	else app.log.info({ signal }, "Shutting down");
	await app.close();
	await egressProxy?.close();
});

await app.listen({ port: config.PORT, host: config.HOST });
