/**
 * Start-wide request middleware.
 *
 * - Server functions are same-origin RPC endpoints: the CSRF middleware
 *   refuses calls from other sites (it checks Sec-Fetch-Site, then
 *   Origin/Referer), so another page can't make its visitors start albums
 *   from their addresses.
 * - The edge proxy (Spotcraft's Caddy) sets HSTS, nosniff and
 *   Referrer-Policy, but no request size limit and none of the headers
 *   below, so the app sets them itself.
 */
import {
	createCsrfMiddleware,
	createMiddleware,
	createStart,
} from "@tanstack/react-start";
import { setResponseHeaders } from "@tanstack/react-start/server";
import { bodyTooLarge, SECURITY_HEADERS } from "./lib/request-limits";

const csrfMiddleware = createCsrfMiddleware({
	filter: (ctx) => ctx.handlerType === "serverFn",
});

const hardeningMiddleware = createMiddleware().server(({ request, next }) => {
	const refused = bodyTooLarge(request);
	if (refused) return refused;
	setResponseHeaders(new Headers(SECURITY_HEADERS));
	return next();
});

export const startInstance = createStart(() => ({
	requestMiddleware: [hardeningMiddleware, csrfMiddleware],
}));
