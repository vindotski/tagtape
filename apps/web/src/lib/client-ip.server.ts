/**
 * The browser's address, for the API's per-client limits.
 *
 * Behind a reverse proxy every request comes from the proxy, so the address
 * must come from X-Forwarded-For, but only when TRUST_PROXY=1: without a
 * proxy in front, anyone could send that header and pick any address.
 * The *last* entry is used: it's the one our proxy added (Caddy replaces the
 * header by default; a proxy that appends leaves client-written entries
 * in front of it).
 */
export function clientAddress(
	headers: Headers,
	socketAddress: string | undefined,
	trustProxy = process.env.TRUST_PROXY === "1",
): string | undefined {
	if (trustProxy) {
		const forwarded = headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
		if (forwarded) return forwarded;
	}
	return socketAddress;
}
