import { fileURLToPath } from "node:url";
import { describe, expect, test, vi } from "vitest";
import { UserFacingError } from "../lib/errors.ts";
import { ExecError, run, spawnStream } from "../lib/exec.ts";
import { createPipeline } from "../pipeline/index.ts";
import { testConfig } from "../test/helpers.ts";
import type { PluginContext, Source } from "./api.ts";
import { loadPlugins, pluginPaths } from "./loader.ts";

const ctx: PluginContext = {
	env: {},
	ffmpegBin: "ffmpeg",
	run,
	spawnStream,
	ExecError,
	UserFacingError,
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
};

const source = (id: string, host: string): Source => ({
	id,
	name: id.toUpperCase(),
	match: (url) => (url.hostname === host ? url.href : null),
	probe: async () => ({
		title: "",
		durationSeconds: 1,
		isLive: false,
		state: null,
	}),
	stream: () => {
		throw new Error("not used");
	},
});

/** Loads fake modules by path, so tests need no files. */
const fakeImport =
	(modules: Record<string, unknown>) =>
	async (url: string): Promise<unknown> => {
		const path = fileURLToPath(url);
		if (!(path in modules)) throw new Error(`Cannot find module ${path}`);
		return modules[path];
	};

const plugin = (sources: Source[], extra: object = {}) => ({
	default: { apiVersion: 1, name: "test", create: () => sources, ...extra },
});

describe("plugin loader", () => {
	test("splits TAGTAPE_PLUGINS", () => {
		expect(pluginPaths(" /a/x.ts , ,plugins/y.ts", "/srv")).toEqual([
			"/a/x.ts",
			"/srv/plugins/y.ts",
		]);
		expect(pluginPaths("")).toEqual([]);
	});

	test("collects sources from every plugin, in order", async () => {
		const sources = await loadPlugins(
			["/p/one.ts", "/p/two.ts"],
			ctx,
			fakeImport({
				"/p/one.ts": plugin([source("a", "a.example")]),
				"/p/two.ts": plugin([source("b", "b.example")]),
			}),
		);
		expect(sources.map((s) => s.id)).toEqual(["a", "b"]);
	});

	test.each([
		["a missing module", ["/p/missing.ts"], {}, "Couldn't load plugin"],
		[
			"another API version",
			["/p/x.ts"],
			{ "/p/x.ts": plugin([], { apiVersion: 2 }) },
			"targets plugin API 2",
		],
		[
			"no default export",
			["/p/x.ts"],
			{ "/p/x.ts": {} },
			"has no default export",
		],
		[
			"an invalid source",
			["/p/x.ts"],
			{ "/p/x.ts": plugin([{ id: "Bad Id" } as unknown as Source]) },
			"invalid source",
		],
		[
			"duplicate ids",
			["/p/x.ts", "/p/y.ts"],
			{
				"/p/x.ts": plugin([source("a", "a.example")]),
				"/p/y.ts": plugin([source("a", "b.example")]),
			},
			'share the id "a"',
		],
	])("refuses %s", async (_label, paths, modules, message) => {
		await expect(loadPlugins(paths, ctx, fakeImport(modules))).rejects.toThrow(
			message,
		);
	});

	test("the pipeline resolves links with the first matching source", async () => {
		const pipeline = createPipeline(testConfig(), [
			source("first", "shared.example"),
			source("second", "shared.example"),
			source("other", "other.example"),
		]);
		expect(pipeline.resolve("shared.example/x")).toEqual({
			source: "first",
			url: "https://shared.example/x",
		});
		expect(pipeline.resolve("https://other.example/y")?.source).toBe("other");
		expect(pipeline.resolve("https://nobody.example/z")).toBeNull();
		expect(pipeline.resolve("javascript:alert(1)")).toBeNull();
	});
});
