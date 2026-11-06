/**
 * Server functions the browser calls. They're public RPC endpoints, so every
 * input is validated again here with the shared schema, even though the form
 * already did it.
 */
import { albumInputSchema } from "@tagtape/shared";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { apiConfigFromEnv, createJob, getJob, getSources } from "./api.server";
import { clientAddress } from "./client-ip.server";
import { proofSchema } from "./pow";
import { createPowChallenge, verifyPow } from "./pow.server";

/**
 * Errors thrown by a server function reach the browser as they are, so
 * anything unexpected (config, API status, parse errors) becomes this.
 */
const UNREACHABLE = "TagTape's converter isn't reachable right now.";

/** A fresh proof-of-work puzzle for the form to solve before submitting. */
export const getChallenge = createServerFn({ method: "GET" }).handler(() =>
	createPowChallenge(),
);

export const startJob = createServerFn({ method: "POST" })
	.validator(z.object({ album: albumInputSchema, proof: proofSchema }))
	.handler(async ({ data }) => {
		const pow = await verifyPow(data.proof);
		if (pow !== "ok") {
			return {
				ok: false as const,
				message:
					"Something went wrong starting the conversion. Please try again.",
				retryProof: true,
			};
		}
		try {
			const client = clientAddress(getRequest().headers, getRequestIP());
			return await createJob(data.album, apiConfigFromEnv(), client);
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
