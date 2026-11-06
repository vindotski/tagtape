/**
 * Server functions the browser calls. They're public RPC endpoints, so every
 * input is validated again here with the shared schema, even though the form
 * already did it.
 */
import { albumInputSchema } from "@tagtape/shared";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { apiConfigFromEnv, createJob, getJob, getSources } from "./api.server";

/**
 * Errors thrown by a server function reach the browser as they are, so
 * anything unexpected (config, API status, parse errors) becomes this.
 */
const UNREACHABLE = "TagTape's converter isn't reachable right now.";

export const startJob = createServerFn({ method: "POST" })
	.validator(albumInputSchema)
	.handler(async ({ data }) => {
		try {
			return await createJob(data, apiConfigFromEnv());
		} catch {
			return { ok: false as const, message: UNREACHABLE };
		}
	});

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
	.handler(async ({ data }) => {
		try {
			return { view: await getJob(data.id, apiConfigFromEnv()) };
		} catch {
			throw new Error(UNREACHABLE);
		}
	});
