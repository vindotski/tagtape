/**
 * Start-wide request middleware. Server functions are same-origin RPC
 * endpoints: the CSRF middleware refuses calls from other sites (it checks
 * Sec-Fetch-Site, then Origin/Referer), so another page can't make its
 * visitors start albums from their addresses.
 */
import { createCsrfMiddleware, createStart } from "@tanstack/react-start";

const csrfMiddleware = createCsrfMiddleware({
	filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
	requestMiddleware: [csrfMiddleware],
}));
