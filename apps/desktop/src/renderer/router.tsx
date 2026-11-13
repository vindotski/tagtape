import {
	createHashHistory,
	createRouter as createTanStackRouter,
} from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
	return createTanStackRouter({
		routeTree,
		// The page is a local file: routes live in the URL's hash.
		history: createHashHistory(),
		scrollRestoration: true,
	});
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
