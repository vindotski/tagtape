import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { apiConfigFromEnv, streamArchive } from "#/lib/api.server";

const jobId = z.uuid();

/**
 * GET /download/:jobId streams a finished album's ZIP from the internal API.
 * The browser only ever talks to the web app's origin.
 */
export const Route = createFileRoute("/download/$jobId")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				const id = jobId.safeParse(params.jobId);
				if (!id.success) {
					return new Response("Not found", { status: 404 });
				}
				return streamArchive(id.data, apiConfigFromEnv());
			},
		},
	},
});
