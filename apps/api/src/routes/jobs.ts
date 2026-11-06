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
import type { Pipeline, ResolvedLink } from "../pipeline/types.ts";

const errorSchema = z.object({
	statusCode: z.number(),
	error: z.string(),
	message: z.string(),
});

const issueSchema = z.object({ path: z.string(), message: z.string() });
const badRequestSchema = errorSchema.extend({ issues: z.array(issueSchema) });

const jobParams = z.object({ id: z.uuid() });

const sourcesResponseSchema = z.object({
	sources: z.array(z.object({ id: z.string(), name: z.string() })),
});

/** Shown when no loaded source handles a link. */
export const UNSUPPORTED_LINK =
	"TagTape can't read tracks from this link. Check that it points to a single track.";

const notFound = {
	statusCode: 404,
	error: "Not Found",
	message: "This job doesn't exist or has expired",
} as const;

export const jobRoutes: FastifyPluginAsyncZod<{
	jobs: JobManager;
	pipeline: Pipeline;
}> = async (app, { jobs, pipeline }) => {
	// Which kinds of links this instance accepts (the web app shows them).
	app.get(
		"/sources",
		{ schema: { response: { 200: sourcesResponseSchema } } },
		async () => ({ sources: pipeline.sources }),
	);

	app.post(
		"/jobs",
		{
			schema: {
				body: albumInputSchema,
				response: {
					202: createJobResponseSchema,
					400: badRequestSchema,
					429: errorSchema,
				},
			},
		},
		async (request, reply) => {
			// The schema checked that each link is a URL; a source must claim it.
			const links: ResolvedLink[] = [];
			const issues: z.infer<typeof issueSchema>[] = [];
			request.body.tracks.forEach((track, index) => {
				const link = pipeline.resolve(track.url);
				if (link) links.push(link);
				else
					issues.push({
						path: `/tracks/${index}/url`,
						message: UNSUPPORTED_LINK,
					});
			});
			if (issues.length > 0) {
				return reply.code(400).send({
					statusCode: 400,
					error: "Bad Request",
					message: "Some links aren't supported",
					issues,
				});
			}

			const job = jobs.create(request.body, links);
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
