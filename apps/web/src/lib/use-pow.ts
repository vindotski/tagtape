import { solveChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/web/pbkdf2";
import { useCallback, useEffect, useRef } from "react";
import { getChallenge } from "./jobs.functions";
import type { PowChallenge, Proof } from "./pow";

type Solution = Proof["solution"];

/** Fetches a puzzle and solves it in a Web Worker (main thread if workers fail). */
async function solve(): Promise<Proof> {
	const challenge = await getChallenge();
	const solution = await solveInWorker(challenge).catch(() =>
		solveChallenge({ challenge, deriveKey }),
	);
	if (!solution) throw new Error("Couldn't solve the puzzle");
	return { challenge, solution };
}

function solveInWorker(challenge: PowChallenge): Promise<Solution | null> {
	return new Promise((resolve, reject) => {
		const worker = new Worker(new URL("./pow.worker.ts", import.meta.url), {
			type: "module",
		});
		worker.onmessage = (event: MessageEvent<Solution | null>) => {
			worker.terminate();
			resolve(event.data);
		};
		worker.onerror = (event) => {
			worker.terminate();
			reject(new Error(event.message));
		};
		worker.postMessage(challenge);
	});
}

/**
 * Proof-of-work for the album form. Solving starts as soon as the form shows,
 * so by the time someone clicks "Convert", the proof is usually ready.
 * Returns a function that hands out one proof per submit (each can be used
 * once) and starts on the next one in the background.
 */
export function usePow(): () => Promise<Proof> {
	const next = useRef<Promise<Proof> | null>(null);

	const prepare = useCallback(() => {
		const promise = solve();
		promise.catch(() => {}); // retried when it's needed
		next.current = promise;
		return promise;
	}, []);

	useEffect(() => {
		prepare();
	}, [prepare]);

	return useCallback(async () => {
		let proof: Proof;
		try {
			proof = await (next.current ?? prepare());
		} catch {
			proof = await prepare();
		}
		// Too close to expiring (the form was open a long time): get a fresh one.
		if (proof.challenge.parameters.expiresAt * 1000 - Date.now() < 30_000) {
			proof = await prepare();
		}
		prepare();
		return proof;
	}, [prepare]);
}
