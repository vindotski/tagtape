import closeWithGrace from "close-with-grace";
import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { UserFacingError } from "./lib/errors.ts";
import { ExecError, run, spawnStream } from "./lib/exec.ts";
import { createPipeline } from "./pipeline/index.ts";
import { loadPlugins, pluginPaths } from "./plugins/loader.ts";

const config = loadConfig();
const app = await buildApp({
	config,
	// Built after the app so plugins log through Fastify's logger.
	pipeline: async (log) =>
		createPipeline(
			config,
			await loadPlugins(pluginPaths(config.TAGTAPE_PLUGINS), {
				env: process.env,
				ffmpegBin: config.FFMPEG_BIN,
				run,
				spawnStream,
				ExecError,
				UserFacingError,
				log,
			}),
		),
});

// SIGINT/SIGTERM or a crash: stop accepting requests, cancel running jobs.
closeWithGrace({ delay: 10_000 }, async ({ signal, err }) => {
	if (err) app.log.error({ err }, "Shutting down after an error");
	else app.log.info({ signal }, "Shutting down");
	await app.close();
});

await app.listen({ port: config.PORT, host: config.HOST });
