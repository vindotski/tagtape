/**
 * Server functions the browser calls. They're public RPC endpoints, so every
 * input is validated again here with the shared schema, even though the form
 * already did it.
 */
import { albumInputSchema } from "@tagtape/shared";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { apiConfigFromEnv, createJob, getJob, getSources } from "./api.server";

export const startJob = createServerFn({ method: "POST" })
	.validator(albumInputSchema)
	.handler(({ data }) => createJob(data, apiConfigFromEnv()));

/** The API's sources, for the page copy. Empty when the API isn't reachable. */
export const fetchSources = createServerFn({ method: "GET" }).handler(
	async () => {
		try {
			return await getSources(apiConfigFromEnv());
		} catch {
			return [];
		}
	},
);

export const fetchJob = createServerFn({ method: "GET" })
	.validator(z.object({ id: z.uuid() }))
	.handler(async ({ data }) => ({
		view: await getJob(data.id, apiConfigFromEnv()),
	}));
