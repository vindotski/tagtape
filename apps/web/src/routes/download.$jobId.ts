import { createFileRoute } from "@tanstack/react-router";
import { getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import {
	apiConfigFromEnv,
	errorResponse,
	streamArchive,
} from "#/lib/api.server";
import { clientAddress } from "#/lib/client-ip.server";

const jobId = z.uuid();

/**
 * GET /download/:jobId: the album's ZIP, converted while it streams from the
 * internal API. The browser only ever talks to the web app's origin, and
 * leaving (closing the tab, cancelling the download) stops the conversion.
 */
export const Route = createFileRoute("/download/$jobId")({
	server: {
		handlers: {
			GET: async ({ params, request }) => {
				const id = jobId.safeParse(params.jobId);
				if (!id.success) {
					return errorResponse("Not found", 404);
				}
				return streamArchive(
					id.data,
					apiConfigFromEnv(),
					request.signal,
					clientAddress(request.headers, getRequestIP()),
				);
			},
		},
	},
});
