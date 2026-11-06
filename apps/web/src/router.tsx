import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { cspNonce } from "./lib/csp.server";
import { routeTree } from "./routeTree.gen";

/** Per request on the server (sets the CSP header too); unused in the browser. */
const nonce = createIsomorphicFn()
	.server(() => cspNonce())
	.client(() => undefined);

export function getRouter() {
	const router = createTanStackRouter({
		routeTree,
		ssr: { nonce: nonce() },
		scrollRestoration: true,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
	});

	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
