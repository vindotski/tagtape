import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
	PLUGIN_API_VERSION,
	type PluginContext,
	type Source,
	type TagTapePlugin,
} from "./api.ts";

const SOURCE_ID = /^[a-z0-9][a-z0-9-]*$/;

/**
 * `TAGTAPE_PLUGINS`: comma-separated paths; relative ones are resolved
 * against the working directory (handy in development).
 */
export function pluginPaths(value: string, cwd = process.cwd()): string[] {
	return value
		.split(",")
		.map((path) => path.trim())
		.filter(Boolean)
		.map((path) => resolve(cwd, path));
}

/**
 * Imports each plugin and collects its sources, in order. Any problem stops
 * the start-up with a clear message: a half-loaded set of sources would
 * silently reject links the operator expects to work.
 */
export async function loadPlugins(
	paths: string[],
	ctx: PluginContext,
	importModule: (url: string) => Promise<unknown> = (url) => import(url),
): Promise<Source[]> {
	const sources: Source[] = [];
	for (const path of paths) {
		let module: unknown;
		try {
			module = await importModule(pathToFileURL(path).href);
		} catch (error) {
			throw new Error(`Couldn't load plugin ${path}`, { cause: error });
		}
		const plugin = (module as { default?: unknown } | null)?.default;
		assertPlugin(plugin, path);
		const created = await plugin.create(ctx);
		if (!Array.isArray(created)) {
			throw new Error(`Plugin ${plugin.name}: create() must return an array`);
		}
		for (const source of created) {
			assertSource(source, plugin.name);
			sources.push(source);
		}
		ctx.log.info(
			{ plugin: plugin.name, sources: created.map((s: Source) => s.id) },
			"Plugin loaded",
		);
	}
	assertUniqueIds(sources);
	return sources;
}

function assertPlugin(
	value: unknown,
	path: string,
): asserts value is TagTapePlugin {
	const plugin = value as Partial<TagTapePlugin> | null | undefined;
	if (!plugin || typeof plugin !== "object") {
		throw new Error(`Plugin ${path} has no default export`);
	}
	if (plugin.apiVersion !== PLUGIN_API_VERSION) {
		throw new Error(
			`Plugin ${path} targets plugin API ${String(plugin.apiVersion)}; this TagTape supports ${PLUGIN_API_VERSION}`,
		);
	}
	if (typeof plugin.name !== "string" || typeof plugin.create !== "function") {
		throw new Error(`Plugin ${path} needs a name and a create() function`);
	}
}

function assertSource(value: unknown, plugin: string): asserts value is Source {
	const source = value as Partial<Source> | null | undefined;
	const ok =
		!!source &&
		typeof source.id === "string" &&
		SOURCE_ID.test(source.id) &&
		typeof source.name === "string" &&
		source.name.length > 0 &&
		typeof source.match === "function" &&
		typeof source.probe === "function" &&
		typeof source.stream === "function";
	if (!ok) {
		throw new Error(
			`Plugin ${plugin} returned an invalid source (needs id, name, match, probe, stream)`,
		);
	}
}

export function assertUniqueIds(sources: Source[]): void {
	const seen = new Set<string>();
	for (const { id } of sources) {
		if (seen.has(id)) throw new Error(`Two sources share the id "${id}"`);
		seen.add(id);
	}
}
