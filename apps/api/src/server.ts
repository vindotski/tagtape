import closeWithGrace from "close-with-grace";
import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { UserFacingError } from "./lib/errors.ts";
import { ExecError, run, spawnStream } from "./lib/exec.ts";
import { createPipeline } from "./pipeline/index.ts";
import { loadPlugins, pluginPaths } from "./plugins/loader.ts";
import { createDirectSource } from "./sources/direct.ts";

const config = loadConfig();
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
		// Plugins are tried first; direct MP3 links are the built-in fallback.
		return createPipeline(config, [
			...plugins,
			createDirectSource({
				ffmpegBin: config.FFMPEG_BIN,
				maxBytes: config.MAX_DIRECT_MB * 1024 * 1024,
				timeoutMs: 30 * 60_000,
			}),
		]);
	},
});

// SIGINT/SIGTERM or a crash: stop accepting requests, cancel running jobs.
closeWithGrace({ delay: 10_000 }, async ({ signal, err }) => {
	if (err) app.log.error({ err }, "Shutting down after an error");
	else app.log.info({ signal }, "Shutting down");
	await app.close();
});

await app.listen({ port: config.PORT, host: config.HOST });
