import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// The parked renderer's tests come back with the Electron shell.
		include: ["src/core/**/*.test.ts"],
	},
});
