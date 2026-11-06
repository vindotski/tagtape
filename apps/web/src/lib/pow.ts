/**
 * Proof-of-work before a job is created (the ALTCHA protocol, via altcha-lib):
 * the server hands out a signed puzzle, the browser solves it in a Web Worker
 * (about a second of CPU, invisible to people), and the server checks the
 * answer. Scripts that start albums in bulk pay that second every time.
 * No cookies, no third party, nothing stored beyond a short replay list.
 */
import { z } from "zod";

export const POW_ALGORITHM = "PBKDF2/SHA-256";

/** A signed challenge plus its solution, as the browser sends it back. */
export const proofSchema = z.object({
	challenge: z.object({
		// Strict: the signature covers exactly these fields.
		parameters: z
			.object({
				algorithm: z.literal(POW_ALGORITHM),
				cost: z.int().positive().max(10_000_000),
				expiresAt: z.int().positive(),
				keyLength: z.int().positive().max(64),
				keyPrefix: z.string().regex(/^[0-9a-f]{1,16}$/),
				nonce: z.string().regex(/^[0-9a-f]{1,128}$/),
				salt: z.string().regex(/^[0-9a-f]{1,128}$/),
			})
			.strict(),
		signature: z.string().regex(/^[0-9a-f]{1,256}$/),
	}),
	solution: z.object({
		counter: z.int().min(0),
		derivedKey: z.string().regex(/^[0-9a-f]{1,256}$/),
		time: z.number().optional(),
	}),
});
export type Proof = z.infer<typeof proofSchema>;
export type PowChallenge = Proof["challenge"];
