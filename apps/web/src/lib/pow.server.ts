import { randomBytes } from "node:crypto";
import { createChallenge, verifySolution } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/web/pbkdf2";
import { POW_ALGORITHM, type PowChallenge, type Proof } from "./pow";

/** How long a puzzle stays valid (a form may stay open a while). */
const CHALLENGE_TTL_MS = 10 * 60_000;
/**
 * Difficulty: PBKDF2 iterations per attempt, and the hex prefix the result
 * must start with (3 hex digits: 1 in 4096 attempts on average). Tuned so a
 * laptop browser needs about a second (POW_COST overrides it).
 */
const KEY_PREFIX = "000";
const DEFAULT_COST = 2000;

/** Random per process: puzzles from before a restart simply stop verifying. */
const SECRET = process.env.POW_SECRET || randomBytes(32).toString("hex");

/** Signatures of proofs already used, until their puzzle expires. */
const used = new Map<string, number>();

function cost(): number {
	const value = Number(process.env.POW_COST);
	return Number.isInteger(value) && value > 0 ? value : DEFAULT_COST;
}

export async function createPowChallenge(): Promise<PowChallenge> {
	const challenge = await createChallenge({
		algorithm: POW_ALGORITHM,
		cost: cost(),
		keyPrefix: KEY_PREFIX,
		deriveKey,
		hmacSignatureSecret: SECRET,
		expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
	});
	return challenge as PowChallenge;
}

export type PowResult = "ok" | "invalid" | "expired" | "used";

/** Checks a proof once: a valid proof can't be used a second time. */
export async function verifyPow(
	proof: Proof,
	now = Date.now(),
): Promise<PowResult> {
	for (const [signature, expires] of used) {
		if (expires <= now) used.delete(signature);
	}
	const { signature } = proof.challenge;
	if (used.has(signature)) return "used";
	// Reserved before the (async) check, so two requests racing with the same
	// proof can't both pass.
	used.set(signature, proof.challenge.parameters.expiresAt * 1000);
	const result = await verifySolution({
		challenge: proof.challenge,
		solution: proof.solution,
		deriveKey,
		hmacSignatureSecret: SECRET,
	}).catch(() => null);
	if (result?.verified) return "ok";
	used.delete(signature);
	return result?.expired ? "expired" : "invalid";
}
