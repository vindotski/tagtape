import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

/** Where this app's own dependencies are linked. */
const modules = fileURLToPath(new URL("../node_modules", import.meta.url));

/** The folder of the package a bundled file belongs to, if it came from node_modules. */
function packageDir(id: string): string | undefined {
	const at = id.lastIndexOf("node_modules/");
	if (at === -1 || id.startsWith("\0")) return undefined;
	const rest = id.slice(at + "node_modules/".length).split("/");
	const name = rest[0]?.startsWith("@") ? `${rest[0]}/${rest[1]}` : rest[0];
	return name ? id.slice(0, at + "node_modules/".length) + name : undefined;
}

/** One package's entry: what it is, under which licence, and the licence text it ships. */
function notice(dir: string): { key: string; text: string } | undefined {
	let manifest: {
		name?: string;
		version?: string;
		license?: string;
		homepage?: string;
		repository?: string | { url?: string };
	};
	try {
		manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
	} catch {
		return undefined;
	}
	if (!manifest.name) return undefined;
	const where =
		manifest.homepage ??
		(typeof manifest.repository === "string"
			? manifest.repository
			: manifest.repository?.url) ??
		"";
	const file = readdirSync(dir).find((entry) =>
		/^(licen[sc]e|copying|notice)(\.|$)/i.test(entry),
	);
	const body = file
		? readFileSync(join(dir, file), "utf8").trim()
		: "(This package ships no licence file; see the address above.)";
	return {
		key: `${manifest.name}@${manifest.version}`,
		text: [
			`${manifest.name} ${manifest.version ?? ""}`.trim(),
			`Licence: ${manifest.license ?? "see below"}`,
			...(where ? [where] : []),
			"",
			body,
		].join("\n"),
	};
}

/**
 * Writes THIRD-PARTY-NOTICES.txt next to a build's output: every npm package
 * whose code ended up in that bundle, with its licence. `also` names packages
 * that ship beside the bundle instead of inside it (native modules); ones
 * not installed on this platform are skipped.
 */
export function thirdPartyNotices(also: string[] = []): Plugin {
	return {
		name: "tagtape:third-party-notices",
		apply: "build",
		generateBundle(_options, bundle) {
			const dirs = new Set<string>();
			for (const chunk of Object.values(bundle)) {
				if (chunk.type !== "chunk") continue;
				for (const id of Object.keys(chunk.modules)) {
					const dir = packageDir(id);
					if (dir && existsSync(dir)) dirs.add(dir);
				}
			}
			for (const name of also) {
				// Missing means it is another platform's package.
				const dir = join(modules, name);
				if (existsSync(dir)) dirs.add(dir);
			}
			const notices = new Map<string, string>();
			for (const dir of dirs) {
				const entry = notice(dir);
				if (entry) notices.set(entry.key, entry.text);
			}
			const rule = `\n\n${"-".repeat(72)}\n\n`;
			this.emitFile({
				type: "asset",
				fileName: "THIRD-PARTY-NOTICES.txt",
				source:
					"TagTape includes code from the packages below, each under its own licence.\n" +
					"ffmpeg and yt-dlp, which ship beside the app, have their licences in the bin folder." +
					rule +
					[...notices.keys()]
						.sort()
						.map((key) => notices.get(key))
						.join(rule) +
					"\n",
			});
		},
	};
}
