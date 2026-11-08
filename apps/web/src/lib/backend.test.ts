import { GuestLimitError } from "@spotcraft/kit";
import { describe, expect, it } from "vitest";
import { ensureGuest, type GuestSource } from "./backend.server";

const request = new Request("http://localhost/_serverFn/start", {
	method: "POST",
});

function source(guest: GuestSource["guest"]): GuestSource {
	return { guest };
}

describe("ensureGuest", () => {
	it("returns the guest id and the session cookies", async () => {
		let seen: string | undefined;
		const result = await ensureGuest(
			source(async (_request, { clientAddress }) => {
				seen = clientAddress;
				const headers = new Headers();
				headers.append("set-cookie", "session=abc; HttpOnly; Path=/");
				return {
					guest: {
						id: "11111111-1111-4111-8111-111111111111",
						createdAt: new Date(),
					},
					headers,
				};
			}),
			request,
			"203.0.113.7",
		);
		expect(seen).toBe("203.0.113.7");
		expect(result).toEqual({
			ok: true,
			guestId: "11111111-1111-4111-8111-111111111111",
			cookies: ["session=abc; HttpOnly; Path=/"],
		});
	});

	it("turns the kit's guest limit into a retry delay", async () => {
		const result = await ensureGuest(
			source(async () => {
				throw new GuestLimitError(120);
			}),
			request,
			"203.0.113.7",
		);
		expect(result).toEqual({ ok: false, retryAfterSeconds: 120 });
	});

	it("lets other errors through", async () => {
		await expect(
			ensureGuest(
				source(async () => {
					throw new Error("database down");
				}),
				request,
				"local",
			),
		).rejects.toThrow("database down");
	});
});
