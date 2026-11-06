import { Readable } from "node:stream";
import { buildApp } from "../app.ts";
import { type Config, configSchema } from "../config.ts";
import type { Pipeline, ProbeResult } from "../pipeline/types.ts";

export const TOKEN = "test-token-0123456789abcdef0123456789";
export const auth = { authorization: `Bearer ${TOKEN}` };

export function testConfig(overrides: Partial<Config> = {}): Config {
	return configSchema.parse({
		API_TOKEN: TOKEN,
		LOG_LEVEL: "silent",
		...overrides,
	});
}

/** Fake MP3 bytes for a URL: a real frame sync, then the URL so tests can tell tracks apart. */
export const fakeMp3 = (url: string) =>
	Buffer.concat([
		Buffer.from([0xff, 0xfb, 0x90, 0x64]),
		Buffer.from(`FAKE:${url}`),
	]);

export interface FakePipeline extends Pipeline {
	probes: Map<string, Omit<ProbeResult, "infoJson" | "sourceCodec"> | Error>;
	/** URLs whose stream was started, in order. */
	streamed: string[];
	/** URLs whose stream was cancelled through its signal. */
	aborted: string[];
	/** When set, every probe waits for this promise (to hold jobs in flight). */
	gate?: Promise<void>;
	/** This URL's stream fails after its first bytes. */
	failStreamOf?: string;
	/** Streams send their first bytes, then wait until cancelled. */
	holdStreams?: boolean;
}

/** A pipeline with no network, no binaries and no disk. */
export function fakePipeline(): FakePipeline {
	const fake: FakePipeline = {
		probes: new Map(),
		streamed: [],
		aborted: [],
		async probe({ url }) {
			if (fake.gate) await fake.gate;
			const result = fake.probes.get(url) ?? {
				title: "Video",
				durationSeconds: 200,
				isLive: false,
			};
			if (result instanceof Error) throw result;
			return {
				...result,
				sourceCodec: "opus",
				infoJson: JSON.stringify({ url }),
			};
		},
		streamMp3({ infoJson, signal }) {
			const { url } = JSON.parse(infoJson) as { url: string };
			fake.streamed.push(url);
			const stream = new Readable({ read() {} });
			stream.push(fakeMp3(url));
			const onAbort = () => {
				fake.aborted.push(url);
				stream.destroy(new DOMException("cancelled", "AbortError"));
			};
			if (signal.aborted) onAbort();
			else signal.addEventListener("abort", onAbort, { once: true });

			if (url === fake.failStreamOf) {
				setImmediate(() => stream.destroy(new Error("ffmpeg exploded")));
			} else if (!fake.holdStreams) {
				setImmediate(() => {
					signal.removeEventListener("abort", onAbort);
					stream.push(null);
				});
			}
			return stream;
		},
		async fetchCover() {
			return Buffer.from("jpeg");
		},
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
	const config = testConfig(options.config);
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

export interface ZipEntry {
	name: string;
	/** Compression method: 0 = stored. */
	method: number;
	data: Buffer;
}

/** Reads a ZIP (stored entries, data descriptors allowed) via its central directory. */
export function readZip(zip: Buffer): ZipEntry[] {
	const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
	if (eocd < 0)
		throw new Error("Not a complete ZIP (no end of central directory)");
	const count = zip.readUInt16LE(eocd + 10);
	let offset = zip.readUInt32LE(eocd + 16);
	const entries: ZipEntry[] = [];
	for (let i = 0; i < count; i++) {
		const method = zip.readUInt16LE(offset + 10);
		const size = zip.readUInt32LE(offset + 20);
		const nameLength = zip.readUInt16LE(offset + 28);
		const extraLength = zip.readUInt16LE(offset + 30);
		const commentLength = zip.readUInt16LE(offset + 32);
		const localOffset = zip.readUInt32LE(offset + 42);
		const name = zip.toString("utf8", offset + 46, offset + 46 + nameLength);
		const dataStart =
			localOffset +
			30 +
			zip.readUInt16LE(localOffset + 26) +
			zip.readUInt16LE(localOffset + 28);
		entries.push({
			name,
			method,
			data: zip.subarray(dataStart, dataStart + size),
		});
		offset += 46 + nameLength + extraLength + commentLength;
	}
	return entries;
}
