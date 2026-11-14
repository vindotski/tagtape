import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// A static site on GitHub Pages, served at the root of its own domain
// (public/CNAME names it). The old address, vindotski.github.io/tagtape/,
// redirects here.
export default defineConfig({
	site: "https://tagtape.app",
	trailingSlash: "ignore",
	vite: {
		plugins: [tailwindcss()],
		// Scripts stay in files of their own: the one page that has a script
		// allows this site's files, never inline code.
		build: { assetsInlineLimit: 0 },
	},
});
