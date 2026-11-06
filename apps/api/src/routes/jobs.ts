import {
	albumInputSchema,
	createJobResponseSchema,
	jobSnapshotSchema,
} from "@tagtape/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { JobManager } from "../jobs/manager.ts";
import { toSnapshot } from "../jobs/store.ts";
import { contentDisposition } from "../lib/filenames.ts";

const errorSchema = z.object({
	statusCode: z.number(),
	error: z.string(),
	message: z.string(),
});

const jobParams = z.object({ id: z.uuid() });

const notFound = {
	statusCode: 404,
	error: "Not Found",
	message: "This job doesn't exist or has expired",
} as const;

export const jobRoutes: FastifyPluginAsyncZod<{ jobs: JobManager }> = async (
	app,
	{ jobs },
) => {
	app.post(
		"/jobs",
		{
			schema: {
				body: albumInputSchema,
				response: { 202: createJobResponseSchema, 429: errorSchema },
			},
		},
		async (request, reply) => {
			const job = jobs.create(request.body);
			if (!job) {
				return reply.code(429).header("retry-after", "60").send({
					statusCode: 429,
					error: "Too Many Requests",
					message: "TagTape is busy right now. Please try again in a minute.",
				});
			}
			request.log.info(
				{ jobId: job.id, tracks: job.tracks.length },
				"Job created",
			);
			return reply.code(202).send({ jobId: job.id });
		},
	);

	app.get(
		"/jobs/:id",
		{
			schema: {
				params: jobParams,
				response: { 200: jobSnapshotSchema, 404: errorSchema },
			},
		},
		async (request, reply) => {
			const job = jobs.get(request.params.id);
			if (!job) return reply.code(404).send(notFound);
			return toSnapshot(job);
		},
	);

	// The download *is* the conversion: tracks convert while this response
	// streams, and nothing is stored. Public by design (the web app proxies it
	// as /download/:id); the job id is an unguessable UUID that expires.
	app.get(
		"/jobs/:id/archive",
		{ config: { public: true }, schema: { params: jobParams } },
		async (request, reply) => {
			// The client leaving (tab closed, download cancelled) stops the work.
			const client = new AbortController();
			reply.raw.once("close", () => {
				if (!reply.raw.writableFinished) client.abort();
			});

			const opened = await jobs.openStream(request.params.id, client.signal);
			switch (opened.kind) {
				case "ok":
					return reply
						.header("content-type", "application/zip")
						.header("content-disposition", contentDisposition(opened.fileName))
						.header("cache-control", "private, no-store")
						.send(opened.stream);
				case "busy":
					return reply.code(409).send({
						statusCode: 409,
						error: "Conflict",
						message: "This album is already downloading",
					});
				case "full":
					return reply.code(429).header("retry-after", "30").send({
						statusCode: 429,
						error: "Too Many Requests",
						message: "TagTape is busy right now. Please try again in a minute.",
					});
				case "aborted":
					return reply;
				default:
					return reply.code(404).send(notFound);
			}
		},
	);
};
