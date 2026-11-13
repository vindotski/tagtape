import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// A static site on GitHub Pages. It lives under the repository's path until
// a custom domain points here: then set `site` to that domain, remove `base`
// and add public/CNAME.
export default defineConfig({
	site: "https://vindotski.github.io",
	base: "/tagtape",
	trailingSlash: "ignore",
	vite: {
		plugins: [tailwindcss()],
		// Scripts stay in files of their own: the one page that has a script
		// allows this site's files, never inline code.
		build: { assetsInlineLimit: 0 },
	},
});
