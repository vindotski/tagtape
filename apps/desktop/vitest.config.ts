import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const renderer = fileURLToPath(new URL("./src/renderer", import.meta.url));

export default defineConfig({
	resolve: { alias: { "#": renderer, "@": renderer } },
	test: {
		include: ["src/**/*.test.ts"],
	},
});
