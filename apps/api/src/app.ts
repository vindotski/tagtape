import { createHash, timingSafeEqual } from "node:crypto";
import Fastify, { type FastifyServerOptions } from "fastify";
import {
	hasZodFastifySchemaValidationErrors,
	serializerCompiler,
	validatorCompiler,
} from "fastify-type-provider-zod";
import type { Config } from "./config.ts";
import { JobManager } from "./jobs/manager.ts";
import type { Pipeline } from "./pipeline/types.ts";
import { healthRoutes } from "./routes/health.ts";
import { jobRoutes } from "./routes/jobs.ts";

declare module "fastify" {
	interface FastifyContextConfig {
		/** Route skips the bearer-token check. */
		public?: boolean;
	}
}

export interface AppDependencies {
	config: Config;
	pipeline: Pipeline;
	logger?: FastifyServerOptions["logger"];
	now?: () => Date;
}

/**
 * Builds the app without listening, so tests can drive it with `inject()`
 * and swap the pipeline for a fake.
 */
export async function buildApp({
	config,
	pipeline,
	logger,
	now,
}: AppDependencies) {
	const app = Fastify({
		logger: logger ?? {
			level: config.LOG_LEVEL,
			redact: ["req.headers.authorization"],
		},
	});
	app.setValidatorCompiler(validatorCompiler);
	app.setSerializerCompiler(serializerCompiler);

	const jobs = new JobManager({
		pipeline,
		tmpDir: config.TMP_DIR,
		ttlMs: config.JOB_TTL_MIN * 60 * 1000,
		maxActiveJobs: config.MAX_ACTIVE_JOBS,
		maxQueuedJobs: config.MAX_QUEUED_JOBS,
		trackConcurrency: config.TRACK_CONCURRENCY,
		log: app.log,
		...(now ? { now } : {}),
	});
	app.decorate("jobs", jobs);
	app.addHook("onReady", () => jobs.start());
	app.addHook("onClose", () => jobs.close());

	// Everything except routes marked `public` needs the web app's bearer token.
	const expected = digest(config.API_TOKEN);
	app.addHook("onRequest", async (request, reply) => {
		if (request.routeOptions.config.public) return;
		const header = request.headers.authorization ?? "";
		const token = header.startsWith("Bearer ") ? header.slice(7) : "";
		// Compare fixed-length digests in constant time, so response timing
		// leaks nothing about the token.
		if (!token || !timingSafeEqual(digest(token), expected)) {
			return reply.code(401).header("www-authenticate", "Bearer").send({
				statusCode: 401,
				error: "Unauthorized",
				message: "Missing or invalid token",
			});
		}
	});

	app.setErrorHandler((error, request, reply) => {
		if (hasZodFastifySchemaValidationErrors(error)) {
			return reply.code(400).send({
				statusCode: 400,
				error: "Bad Request",
				message: "The request is invalid",
				issues: error.validation.map((issue) => ({
					path: issue.instancePath,
					message: issue.message,
				})),
			});
		}
		const statusCode = (error as { statusCode?: unknown } | null)?.statusCode;
		const status = typeof statusCode === "number" ? statusCode : 500;
		if (status >= 500) {
			request.log.error({ err: error }, "Unhandled error");
			return reply.code(500).send({
				statusCode: 500,
				error: "Internal Server Error",
				message: "Something went wrong",
			});
		}
		return reply.code(status).send(error);
	});

	await app.register(healthRoutes, { pipeline });
	await app.register(jobRoutes, { jobs });

	return app;
}

function digest(value: string): Buffer {
	return createHash("sha256").update(value).digest();
}

declare module "fastify" {
	interface FastifyInstance {
		jobs: JobManager;
	}
}
