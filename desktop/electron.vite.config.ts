import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import type { Plugin } from "vite";

// One version for everything: the root package.json. CI may pass
// TAGTAPE_VERSION (e.g. 4.0.0+main.abc1234) for builds that aren't releases.
const rootPackage = JSON.parse(
	readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };
const define = {
	__APP_VERSION__: JSON.stringify(
		process.env.TAGTAPE_VERSION || rootPackage.version,
	),
};
const renderer = fileURLToPath(new URL("./src/renderer", import.meta.url));

/**
 * The packaged page may load only its own files: no remote scripts, styles,
 * images or connections. (A header can't carry this: the page is a local
 * file. The dev server is left alone, since hot reload needs inline scripts.)
 */
const CONTENT_SECURITY_POLICY = [
	"default-src 'none'",
	"script-src 'self'",
	"style-src 'self' 'unsafe-inline'",
	"font-src 'self'",
	"img-src 'self' data:",
	"connect-src 'none'",
	"base-uri 'none'",
	"form-action 'none'",
].join("; ");

const contentSecurityPolicy: Plugin = {
	name: "tagtape:content-security-policy",
	apply: "build",
	transformIndexHtml: () => [
		{
			tag: "meta",
			attrs: {
				"http-equiv": "Content-Security-Policy",
				content: CONTENT_SECURITY_POLICY,
			},
			injectTo: "head-prepend",
		},
	],
};

// @tagtape/shared ships TypeScript source, so it's bundled, not left to Node.
const bundled = { exclude: ["@tagtape/shared"] };

export default defineConfig({
	main: {
		define,
		build: {
			externalizeDeps: bundled,
			rollupOptions: { input: "src/main/index.ts" },
		},
	},
	preload: {
		define,
		build: {
			externalizeDeps: bundled,
			// A sandboxed preload script must be CommonJS.
			rollupOptions: {
				input: "src/preload/index.ts",
				output: { format: "cjs", entryFileNames: "[name].cjs" },
			},
		},
	},
	renderer: {
		root: renderer,
		define,
		resolve: { alias: { "#": renderer, "@": renderer } },
		build: { rollupOptions: { input: `${renderer}/index.html` } },
		plugins: [
			tailwindcss(),
			// Must come before the React plugin.
			tanstackRouter({
				target: "react",
				routesDirectory: `${renderer}/routes`,
				generatedRouteTree: `${renderer}/routeTree.gen.ts`,
				quoteStyle: "double",
				semicolons: true,
			}),
			react(),
			contentSecurityPolicy,
		],
	},
});
