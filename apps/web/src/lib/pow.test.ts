import { solveChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/web/pbkdf2";
import { beforeAll, describe, expect, test } from "vitest";
import { clientAddress } from "./client-ip.server";
import { type Proof, proofSchema } from "./pow";
import { createPowChallenge, verifyPow } from "./pow.server";

beforeAll(() => {
	process.env.POW_COST = "10"; // fast tests; difficulty isn't what's tested
});

async function solved(): Promise<Proof> {
	const challenge = await createPowChallenge();
	const solution = await solveChallenge({ challenge, deriveKey });
	if (!solution) throw new Error("unsolved");
	return proofSchema.parse({ challenge, solution });
}

describe("proof-of-work", () => {
	test("a solved puzzle is accepted once, then refused", async () => {
		const proof = await solved();
		expect(await verifyPow(proof)).toBe("ok");
		expect(await verifyPow(proof)).toBe("used");
	});

	test("two requests racing with the same proof: only one passes", async () => {
		const proof = await solved();
		const results = await Promise.all([verifyPow(proof), verifyPow(proof)]);
		expect(results.sort()).toEqual(["ok", "used"]);
	});

	test("a wrong answer or a tampered puzzle is refused", async () => {
		const proof = await solved();
		const wrong = {
			...proof,
			solution: { ...proof.solution, counter: proof.solution.counter + 1 },
		};
		expect(await verifyPow(wrong)).toBe("invalid");
		const easier = structuredClone(proof);
		easier.challenge.parameters.cost = 1;
		expect(await verifyPow(easier)).toBe("invalid");
	});

	test("an expired puzzle is refused", async () => {
		const proof = await solved();
		const later = proof.challenge.parameters.expiresAt * 1000 + 1;
		const realNow = Date.now;
		Date.now = () => later;
		try {
			expect(await verifyPow(proof, later)).toBe("expired");
		} finally {
			Date.now = realNow;
		}
	});

	test("the proof schema rejects unexpected fields", () => {
		expect(
			proofSchema.safeParse({
				challenge: {
					parameters: {
						algorithm: "PBKDF2/SHA-256",
						cost: 1,
						expiresAt: 1,
						keyLength: 32,
						keyPrefix: "0",
						nonce: "ab",
						salt: "cd",
						extra: "x",
					},
					signature: "ef",
				},
				solution: { counter: 1, derivedKey: "00" },
			}).success,
		).toBe(false);
	});
});

describe("client address", () => {
	const headers = new Headers({
		"x-forwarded-for": "198.51.100.9, 203.0.113.7",
	});

	test("behind a trusted proxy: the entry the proxy added (the last one)", () => {
		expect(clientAddress(headers, "172.18.0.3", true)).toBe("203.0.113.7");
	});

	test("without TRUST_PROXY, X-Forwarded-For is ignored", () => {
		expect(clientAddress(headers, "172.18.0.3", false)).toBe("172.18.0.3");
	});

	test("trusted proxy but no header: the socket address", () => {
		expect(clientAddress(new Headers(), "172.18.0.3", true)).toBe("172.18.0.3");
	});
});
