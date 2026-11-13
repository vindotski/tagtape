import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import type { Plugin } from "vite";
import { thirdPartyNotices } from "./scripts/notices-plugin.ts";

// One version for everything: the root package.json (electron-builder reads
// the same one).
const rootPackage = JSON.parse(
	readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { version: string };
const desktopPackage = JSON.parse(
	readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as {
	dependencies: Record<string, string>;
	optionalDependencies: Record<string, string>;
};
// Shipped beside the bundle (native code), so the bundler never sees them.
const shippedBeside = Object.keys({
	...desktopPackage.dependencies,
	...desktopPackage.optionalDependencies,
}).filter((name) => name !== "@tagtape/shared");

const define = {
	__APP_VERSION__: JSON.stringify(rootPackage.version),
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
		plugins: [thirdPartyNotices(shippedBeside)],
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
		build: {
			// electron-vite leaves code readable by default; the page's script
			// is a third of the size minified.
			minify: true,
			rollupOptions: { input: `${renderer}/index.html` },
		},
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
			// The font arrives through CSS, which the bundle's module list
			// doesn't show.
			thirdPartyNotices(["@fontsource-variable/oxanium"]),
		],
	},
});
