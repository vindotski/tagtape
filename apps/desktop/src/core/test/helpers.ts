import { Readable } from "node:stream";
import { fromPipeline } from "../index.ts";
import type { Pipeline } from "../pipeline/types.ts";
import type { TrackProbe } from "../plugins/api.ts";

/** Fake MP3 bytes for a URL: a real frame sync, then the URL so tests can tell tracks apart. */
export const fakeMp3 = (url: string) =>
	Buffer.concat([
		Buffer.from([0xff, 0xfb, 0x90, 0x64]),
		Buffer.from(`FAKE:${url}`),
	]);

export interface FakePipeline extends Pipeline {
	probes: Map<string, Omit<TrackProbe, "state"> | Error>;
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

/**
 * A pipeline with one made-up source ("Example Music", see `trackUrl`) and no
 * network, no binaries and no disk.
 */
export function fakePipeline(): FakePipeline {
	const fake: FakePipeline = {
		sources: [{ id: "example", name: "Example Music" }],
		resolve(input) {
			const match = /^(?:https?:\/\/)?music\.example\.com\/t\/(\w+)/.exec(
				input,
			);
			return match
				? { source: "example", url: `https://music.example.com/t/${match[1]}` }
				: null;
		},
		probes: new Map(),
		streamed: [],
		aborted: [],
		async probe({ url, signal }) {
			if (fake.gate) {
				// Like a real source: give up when the job is aborted.
				await Promise.race([
					fake.gate,
					new Promise((_, reject) =>
						signal.addEventListener("abort", () => reject(signal.reason), {
							once: true,
						}),
					),
				]);
			}
			const result = fake.probes.get(url) ?? {
				title: "Track",
				durationSeconds: 200,
				isLive: false,
			};
			if (result instanceof Error) throw result;
			return { ...result, state: { url } };
		},
		stream({ state, signal }) {
			const { url } = state as { url: string };
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
			return { ffmpeg: "ffmpeg version 7.1", example: "1.0" };
		},
	};
	return fake;
}

const silent = { info() {}, warn() {}, error() {} };

/** The pipeline's public object over a fake pipeline. */
export function testTagTape(
	options: { pipeline?: FakePipeline; now?: () => Date } = {},
) {
	const pipeline = options.pipeline ?? fakePipeline();
	const tagtape = fromPipeline(pipeline, {
		log: silent,
		...(options.now ? { now: options.now } : {}),
	});
	return { tagtape, pipeline };
}

/** A link to track `n` of the fake source, as someone might paste it. */
export const trackUrl = (n: number) =>
	`music.example.com/t/${String(n).padStart(2, "0")}?ref=share`;
/** The same link, canonicalised by the fake source. */
export const canonical = (n: number) =>
	`https://music.example.com/t/${String(n).padStart(2, "0")}`;

export function album(trackCount = 2) {
	return {
		title: "Night Drive",
		artist: "The Examples",
		genre: "Synthwave",
		year: "2026",
		tracks: Array.from({ length: trackCount }, (_, i) => ({
			title: `Track ${i + 1}`,
			url: trackUrl(i + 1),
		})),
	};
}
