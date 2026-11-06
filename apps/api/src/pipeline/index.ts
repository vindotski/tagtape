import { parseWebUrl } from "@tagtape/shared";
import type { Config } from "../config.ts";
import { run } from "../lib/exec.ts";
import type { Source } from "../plugins/api.ts";
import { assertUniqueIds } from "../plugins/loader.ts";
import { fetchCover } from "./cover.ts";
import type { Pipeline } from "./types.ts";

/** The real pipeline: the loaded sources, ffmpeg for `/health`, sharp for covers. */
export function createPipeline(config: Config, sources: Source[]): Pipeline {
	assertUniqueIds(sources);
	const byId = new Map(sources.map((source) => [source.id, source]));
	const get = (id: string) => {
		const source = byId.get(id);
		if (!source) throw new Error(`Unknown source "${id}"`);
		return source;
	};

	return {
		sources: sources.map(({ id, name }) => ({ id, name })),
		resolve(input) {
			const url = parseWebUrl(input);
			if (!url) return null;
			for (const source of sources) {
				const canonical = source.match(url);
				if (canonical) return { source: source.id, url: canonical };
			}
			return null;
		},
		probe: ({ source, ...input }) => get(source).probe(input),
		stream: ({ source, ...input }) => get(source).stream(input),
		fetchCover,
		async versions() {
			const [ffmpeg, ...versions] = await Promise.all([
				run(config.FFMPEG_BIN, ["-version"], { timeoutMs: 10_000 }),
				...sources.map((source) => source.version?.()),
			]);
			const result: Record<string, string> = {
				ffmpeg: ffmpeg.stdout.split("\n")[0]?.trim() ?? "",
			};
			sources.forEach((source, index) => {
				const version = versions[index];
				if (version) result[source.id] = version;
			});
			return result;
		},
	};
}

export type { Pipeline } from "./types.ts";
