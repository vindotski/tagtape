import { randomBytes } from "node:crypto";
import { setResponseHeader } from "@tanstack/react-start/server";

/**
 * Content-Security-Policy for one page response, with a fresh nonce for the
 * router's inline (hydration) scripts. Everything else must come from our
 * own origin: no third-party scripts, styles, fonts, frames or connections.
 * `style-src 'unsafe-inline'` is for style *attributes* (drag-and-drop sets
 * transforms inline); scripts get no such exception.
 */
export function cspPolicy(nonce: string): string {
	return [
		"default-src 'self'",
		`script-src 'self' 'nonce-${nonce}'`,
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data:",
		"font-src 'self'",
		"connect-src 'self'",
		"worker-src 'self'",
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		"frame-ancestors 'none'",
	].join("; ");
}

/**
 * A nonce for this request, with the matching CSP header set on the response.
 * Production only: Vite's dev server injects inline scripts without one.
 */
export function cspNonce(): string | undefined {
	if (!import.meta.env.PROD) return undefined;
	const nonce = randomBytes(16).toString("base64");
	setResponseHeader("content-security-policy", cspPolicy(nonce));
	return nonce;
}
