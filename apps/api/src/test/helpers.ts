import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../app.ts";
import { type Config, configSchema } from "../config.ts";
import { writeArchive } from "../pipeline/archive.ts";
import type { Pipeline, ProbeResult, TrackTags } from "../pipeline/types.ts";

export const TOKEN = "test-token-0123456789abcdef0123456789";
export const auth = { authorization: `Bearer ${TOKEN}` };

export async function testConfig(
	overrides: Partial<Config> = {},
): Promise<Config> {
	const tmp = await mkdtemp(join(tmpdir(), "tagtape-test-"));
	return configSchema.parse({
		API_TOKEN: TOKEN,
		LOG_LEVEL: "silent",
		TMP_DIR: join(tmp, "jobs"),
		...overrides,
	});
}

export interface FakePipeline extends Pipeline {
	probes: Map<string, ProbeResult | Error>;
	tagged: Array<{ path: string; tags: TrackTags }>;
	/** When set, every probe waits for this promise (to hold jobs in flight). */
	gate?: Promise<void>;
	failDownloadOf?: string;
}

/**
 * A pipeline with no network or binaries. Downloads write a small fake MP3 so
 * the real ZIP writer has something to package.
 */
export function fakePipeline(): FakePipeline {
	const fake: FakePipeline = {
		probes: new Map(),
		tagged: [],
		async probe({ url, infoPath }) {
			if (fake.gate) await fake.gate;
			const result = fake.probes.get(url) ?? {
				title: "Video",
				durationSeconds: 200,
				isLive: false,
			};
			if (result instanceof Error) throw result;
			await writeFile(infoPath, JSON.stringify({ url }));
			return result;
		},
		async downloadAudio({ infoPath, workDir, baseName, onConverting }) {
			const { url } = JSON.parse(
				await import("node:fs/promises").then((fs) =>
					fs.readFile(infoPath, "utf8"),
				),
			) as { url: string };
			if (url === fake.failDownloadOf) throw new Error("ffmpeg exploded");
			onConverting();
			const path = join(workDir, `${baseName}.mp3`);
			await writeFile(path, `fake mp3 ${baseName}`);
			return path;
		},
		async fetchCover() {
			return Buffer.from("jpeg");
		},
		async writeTags(path, tags) {
			fake.tagged.push({ path, tags });
		},
		writeArchive,
		async versions() {
			return { ytDlp: "2026.10.01", ffmpeg: "ffmpeg version 7.1" };
		},
	};
	return fake;
}

export async function testApp(
	options: {
		config?: Partial<Config>;
		pipeline?: FakePipeline;
		now?: () => Date;
	} = {},
) {
	const pipeline = options.pipeline ?? fakePipeline();
	const config = await testConfig(options.config);
	const app = await buildApp({
		config,
		pipeline,
		logger: false,
		...(options.now ? { now: options.now } : {}),
	});
	await app.ready();
	return { app, pipeline, config };
}

export const ytUrl = (n: number) =>
	`https://youtu.be/dQw4w9WgX${String(n).padStart(2, "0")}`;
export const canonical = (n: number) =>
	`https://www.youtube.com/watch?v=dQw4w9WgX${String(n).padStart(2, "0")}`;

export function album(trackCount = 2) {
	return {
		title: "Whenever You Need Somebody",
		artist: "Rick Astley",
		genre: "Pop",
		year: "1987",
		tracks: Array.from({ length: trackCount }, (_, i) => ({
			title: `Track ${i + 1}`,
			url: ytUrl(i + 1),
		})),
	};
}
