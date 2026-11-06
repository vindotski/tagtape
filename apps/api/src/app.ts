import { createHash, timingSafeEqual } from "node:crypto";
import Fastify, {
	type FastifyBaseLogger,
	type FastifyServerOptions,
} from "fastify";
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
	/** The pipeline, or a factory that gets the app's logger (for plugins). */
	pipeline: Pipeline | ((log: FastifyBaseLogger) => Promise<Pipeline>);
	logger?: FastifyServerOptions["logger"];
	now?: () => Date;
}

/**
 * Builds the app without listening, so tests can drive it with `inject()`
 * and swap the pipeline for a fake.
 */
export async function buildApp({
	config,
	pipeline: pipelineOrFactory,
	logger,
	now,
}: AppDependencies) {
	const app = Fastify({
		logger: logger ?? {
			level: config.LOG_LEVEL,
			redact: ["req.headers.authorization"],
			serializers: {
				// A job id is the only key to its download: keep it out of the logs.
				req: (request: { method: string; url: string }) => ({
					method: request.method,
					url: maskJobIds(request.url),
				}),
			},
		},
	});
	const pipeline =
		typeof pipelineOrFactory === "function"
			? await pipelineOrFactory(app.log)
			: pipelineOrFactory;
	app.setValidatorCompiler(validatorCompiler);
	app.setSerializerCompiler(serializerCompiler);

	const jobs = new JobManager({
		pipeline,
		ttlMs: config.JOB_TTL_MIN * 60 * 1000,
		maxActiveProbes: config.MAX_ACTIVE_PROBES,
		maxQueuedJobs: config.MAX_QUEUED_JOBS,
		maxActiveStreams: config.MAX_ACTIVE_STREAMS,
		maxQueuedStreams: config.MAX_QUEUED_STREAMS,
		maxDownloadsPerJob: config.MAX_DOWNLOADS_PER_JOB,
		maxStoredJobs: config.MAX_STORED_JOBS,
		checkTimeoutMs: config.CHECK_TIMEOUT_SEC * 1000,
		maxJobsPerClientHour: config.MAX_JOBS_PER_CLIENT_HOUR,
		maxCheckingJobsPerClient: config.MAX_CHECKING_JOBS_PER_CLIENT,
		maxDownloadsPerClient: config.MAX_DOWNLOADS_PER_CLIENT,
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

	await app.register(healthRoutes, {
		pipeline,
		version: config.TAGTAPE_VERSION,
	});
	await app.register(jobRoutes, { jobs, pipeline });

	return app;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** "/jobs/8f14e45f-…/archive" → "/jobs/:id/archive". */
export function maskJobIds(url: string): string {
	return url.replace(UUID, ":id");
}

function digest(value: string): Buffer {
	return createHash("sha256").update(value).digest();
}

declare module "fastify" {
	interface FastifyInstance {
		jobs: JobManager;
	}
}
