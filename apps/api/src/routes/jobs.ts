import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
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

	// Public: the browser downloads straight from here. The job id is an
	// unguessable UUID and stops working once the job expires.
	app.get(
		"/jobs/:id/archive",
		{ config: { public: true }, schema: { params: jobParams } },
		async (request, reply) => {
			const job = jobs.get(request.params.id);
			const file = job?.archivePath
				? await stat(job.archivePath).catch(() => null)
				: null;
			if (!job?.archivePath || !file?.isFile()) {
				return reply.code(404).send(notFound);
			}
			return reply
				.header("content-type", "application/zip")
				.header("content-length", file.size)
				.header(
					"content-disposition",
					contentDisposition(job.archiveName ?? "tagtape.zip"),
				)
				.header("cache-control", "private, no-store")
				.send(createReadStream(job.archivePath));
		},
	);
};
