/**
 * Request limits and response headers the app enforces itself, because the
 * edge proxy doesn't (Spotcraft's Caddy has no body limit and sets only HSTS,
 * nosniff and Referrer-Policy). The CSP is separate: it carries a nonce per
 * page (`csp.server.ts`).
 */

/** Nothing TagTape accepts is bigger than a few KB (album details, links). */
export const MAX_BODY_BYTES = 64 * 1024;

export const SECURITY_HEADERS: Record<string, string> = {
	// Never shown inside another site's frame (the CSP's frame-ancestors says
	// the same, for browsers that read it).
	"x-frame-options": "DENY",
	"cross-origin-opener-policy": "same-origin",
	"permissions-policy":
		"camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
};

/**
 * A 411 or 413 response for a request whose body is unknown or too big;
 * `undefined` when it may go on. Bodies must declare their length (browsers
 * always do for the form's requests), so a chunked upload can't stream
 * unbounded data into a handler that reads the whole body.
 */
export function bodyTooLarge(request: Request): Response | undefined {
	if (request.method === "GET" || request.method === "HEAD") return undefined;
	const header = request.headers.get("content-length");
	if (header === null) {
		// No body at all is fine; a body of unknown length isn't.
		return request.body === null
			? undefined
			: new Response("Length Required", { status: 411 });
	}
	const length = Number(header);
	if (!Number.isSafeInteger(length) || length < 0) {
		return new Response("Bad Request", { status: 400 });
	}
	if (length > MAX_BODY_BYTES) {
		return new Response("Payload Too Large", { status: 413 });
	}
	return undefined;
}
