import { defineConfig } from "vitest/config";

// Unit tests only need path aliases, not the TanStack Start / React plugins.
export default defineConfig({
	resolve: { tsconfigPaths: true },
	test: { include: ["src/**/*.test.ts"] },
});
