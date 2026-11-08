/**
 * Server functions the browser calls. They're public RPC endpoints, so every
 * input is validated again here with the shared schema, even though the form
 * already did it.
 */
import { albumInputSchema } from "@tagtape/shared";
import { createServerFn } from "@tanstack/react-start";
import {
	appendResponseHeader,
	getRequest,
	getRequestIP,
} from "@tanstack/react-start/server";
import { z } from "zod";
import { apiConfigFromEnv, createJob, getJob, getSources } from "./api.server";
import { backend, ensureGuest } from "./backend.server";
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
		const request = getRequest();
		const client = clientAddress(request.headers, getRequestIP());
		// Starting an album is the visitor's first write, so this is where a
		// guest is created (page views never make one). Nothing is stored under
		// it yet. The proof is spent by now, so a failure asks for a fresh one.
		let guest: Awaited<ReturnType<typeof ensureGuest>>;
		try {
			guest = await ensureGuest(backend(), request, client ?? "local");
		} catch (error) {
			console.error("[tagtape] guest account failed", error);
			return {
				ok: false as const,
				message:
					"Something went wrong starting the conversion. Please try again.",
				retryProof: true,
			};
		}
		if (!guest.ok) {
			const minutes = Math.max(1, Math.ceil(guest.retryAfterSeconds / 60));
			return {
				ok: false as const,
				message: `Too many new visitors from your network. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
			};
		}
		for (const cookie of guest.cookies)
			appendResponseHeader("set-cookie", cookie);
		try {
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
