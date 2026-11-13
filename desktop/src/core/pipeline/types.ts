import type { Readable } from "node:stream";
import type { TrackProbe } from "../plugins/api.ts";

/**
 * Everything the job runner needs from the outside world (the track sources,
 * the cover download), behind one interface so the runner can be tested with
 * fakes. Same idea as TagTape v1's Downloader / TagWriter interfaces.
 *
 * Nothing here touches the disk: probes stay in memory and audio streams
 * straight from the source to the client.
 */
export interface Pipeline {
	/** The sources links can come from, in matching order. */
	sources: SourceInfo[];
	/** Which source handles a link, and its canonical URL; `null` if none does. */
	resolve(input: string): ResolvedLink | null;
	/** One track's details, read through its source (kept in memory). */
	probe(input: {
		source: string;
		url: string;
		signal: AbortSignal;
	}): Promise<TrackProbe>;
	/**
	 * One track as an untagged MP3 byte stream. It ends only on success; on
	 * failure it's destroyed with the reason (a `UserFacingError` when the
	 * user should see it).
	 */
	stream(input: {
		source: string;
		state: unknown;
		signal: AbortSignal;
	}): Readable;
	/** Download a cover image and turn it into a 1000×1000 JPEG (in memory). */
	fetchCover(input: { url: string; signal: AbortSignal }): Promise<Buffer>;
	/** Versions of ffmpeg and of each source, for the health check. */
	versions(): Promise<Record<string, string>>;
}

export interface SourceInfo {
	id: string;
	name: string;
}

export interface ResolvedLink {
	source: string;
	url: string;
}
