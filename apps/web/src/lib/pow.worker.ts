/** Solves one proof-of-work puzzle off the main thread (see pow.ts). */
import { solveChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/web/pbkdf2";
import type { PowChallenge } from "./pow";

const scope = globalThis as unknown as {
	onmessage: ((event: MessageEvent<PowChallenge>) => void) | null;
	postMessage(message: unknown): void;
};

scope.onmessage = async (event) => {
	const solution = await solveChallenge({
		challenge: event.data,
		deriveKey,
		timeout: 120_000,
	});
	scope.postMessage(solution);
};
