import closeWithGrace from "close-with-grace";
import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { createPipeline } from "./pipeline/index.ts";

const config = loadConfig();
const app = await buildApp({ config, pipeline: createPipeline(config) });

// SIGINT/SIGTERM or a crash: stop accepting requests, cancel jobs, clean temp files.
closeWithGrace({ delay: 10_000 }, async ({ signal, err }) => {
	if (err) app.log.error({ err }, "Shutting down after an error");
	else app.log.info({ signal }, "Shutting down");
	await app.close();
});

await app.listen({ port: config.PORT, host: config.HOST });
