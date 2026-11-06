import { readFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// One version for web + API: CI passes TAGTAPE_VERSION (e.g. 2.0.0 or
// 2.0.0+main.abc1234); otherwise use the root package.json version.
const rootPackage = JSON.parse(
	readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { version: string };
const appVersion = process.env.TAGTAPE_VERSION || rootPackage.version;

const config = defineConfig({
	resolve: { tsconfigPaths: true },
	define: { __APP_VERSION__: JSON.stringify(appVersion) },
	plugins: [tailwindcss(), tanstackStart(), viteReact()],
});

export default config;
