import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
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

/**
 * A package that ships as it is, with everything it needs at run time: its
 * dependencies and those of its optional ones that are installed, all the
 * way down. Each is looked up next to its parent's real location, which is
 * where pnpm links a package's own dependencies.
 */
function withRuntimeDependencies(dir: string, found = new Set<string>()) {
	const real = realpathSync(dir);
	if (found.has(real)) return found;
	found.add(real);
	let manifest: {
		name?: string;
		dependencies?: Record<string, string>;
		optionalDependencies?: Record<string, string>;
	};
	try {
		manifest = JSON.parse(readFileSync(join(real, "package.json"), "utf8"));
	} catch {
		return found;
	}
	// `.../node_modules/@scope/name` → `.../node_modules`.
	const siblings = manifest.name?.startsWith("@")
		? dirname(dirname(real))
		: dirname(real);
	for (const name of Object.keys({
		...manifest.dependencies,
		...manifest.optionalDependencies,
	})) {
		const dependency = join(siblings, name);
		// Missing means it is another platform's package.
		if (existsSync(dependency)) withRuntimeDependencies(dependency, found);
	}
	return found;
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
 * whose code ended up in that bundle, with its licence, plus the packages
 * the bundler doesn't see:
 *
 * - `beside`: ones that ship next to the bundle as they are (native
 *   modules), listed with everything they need at run time;
 * - `named`: ones only part of which ships (a stylesheet, a font), listed
 *   alone: what they depend on to do their own work isn't in the app.
 *
 * Ones not installed on this platform are skipped.
 */
export function thirdPartyNotices(
	also: { beside?: string[]; named?: string[] } = {},
): Plugin {
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
			// Missing means it is another platform's package.
			for (const name of also.beside ?? []) {
				const dir = join(modules, name);
				if (!existsSync(dir)) continue;
				for (const each of withRuntimeDependencies(dir)) dirs.add(each);
			}
			for (const name of also.named ?? []) {
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
