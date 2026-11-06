import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { Pipeline } from "../pipeline/types.ts";

/** Public liveness check that also proves ffmpeg and every source's tools run. */
export const healthRoutes: FastifyPluginAsyncZod<{
	pipeline: Pipeline;
	version: string;
}> = async (app, { pipeline, version }) => {
	app.get("/health", { config: { public: true } }, async (request, reply) => {
		try {
			const versions = await pipeline.versions();
			return { status: "ok", version, versions };
		} catch (error) {
			request.log.error({ err: error }, "Health check failed");
			return reply.code(503).send({ status: "unavailable" });
		}
	});
};
