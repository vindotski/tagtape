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
import {
	database,
	deleteAlbum,
	getAlbum,
	HISTORY_LIMIT,
	listAlbums,
	recordAlbum,
} from "./albums.server";
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
	.validator(
		z.object({
			album: albumInputSchema,
			proof: proofSchema,
			/** Set when a stored album is made again: that album is updated. */
			albumId: z.uuid().optional(),
		}),
	)
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
		let result: Awaited<ReturnType<typeof createJob>>;
		try {
			result = await createJob(data.album, apiConfigFromEnv(), client);
		} catch {
			return { ok: false as const, message: UNREACHABLE };
		}
		if (!result.ok) return result;
		// History is a convenience: the album still starts if this fails.
		let albumId: string | undefined;
		try {
			albumId = await recordAlbum(
				await database(),
				guest.guestId,
				data.album,
				data.albumId,
			);
		} catch (error) {
			console.error("[tagtape] recording the album failed", error);
		}
		return { ...result, albumId };
	});

/**
 * The guest behind this request, if there is one. Reading never creates a
 * guest; it refreshes the session cookie of one that exists.
 */
async function readGuest() {
	const { guest, headers } = await backend().currentGuest(getRequest());
	for (const cookie of headers.getSetCookie()) {
		appendResponseHeader("set-cookie", cookie);
	}
	return guest;
}

/** The visitor's albums, most recent first. Empty when the database is down. */
export const fetchAlbums = createServerFn({ method: "GET" })
	.validator(
		z
			.object({ limit: z.int().min(1).max(HISTORY_LIMIT).optional() })
			.optional(),
	)
	.handler(async ({ data }) => {
		try {
			const guest = await readGuest();
			if (!guest) return [];
			return await listAlbums(await database(), guest.id, data?.limit);
		} catch (error) {
			console.error("[tagtape] reading album history failed", error);
			return [];
		}
	});

/** One of the visitor's albums in full, or null (not theirs, gone, or no guest). */
export const fetchAlbum = createServerFn({ method: "GET" })
	.validator(z.object({ id: z.uuid() }))
	.handler(async ({ data }) => {
		try {
			const guest = await readGuest();
			if (!guest) return null;
			return await getAlbum(await database(), guest.id, data.id);
		} catch (error) {
			console.error("[tagtape] reading an album failed", error);
			throw new Error("Your albums can't be loaded right now.");
		}
	});

export const removeAlbum = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.uuid() }))
	.handler(async ({ data }) => {
		try {
			const guest = await readGuest();
			if (!guest) return { ok: false as const };
			const ok = await deleteAlbum(await database(), guest.id, data.id);
			return { ok };
		} catch (error) {
			console.error("[tagtape] deleting an album failed", error);
			return { ok: false as const };
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
