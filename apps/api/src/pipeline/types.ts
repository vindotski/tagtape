import type { Readable } from "node:stream";

/**
 * Everything the job runner needs from the outside world (yt-dlp, ffmpeg, the
 * network), behind one interface so the runner can be tested with fakes. Same
 * idea as TagTape v1's Downloader / TagWriter interfaces.
 *
 * Nothing here touches the disk: probes stay in memory and audio streams
 * straight from the source to the client.
 */
export interface Pipeline {
	/** Fetch one track's metadata (kept in memory for the stream step). */
	probe(input: { url: string; signal: AbortSignal }): Promise<ProbeResult>;
	/**
	 * Download and convert one track, as an MP3 byte stream without tags. It ends
	 * only on success; on failure it's destroyed with the reason (a
	 * `UserFacingError` when the user should see it).
	 */
	streamMp3(input: {
		infoJson: string;
		sourceCodec: string | null;
		signal: AbortSignal;
	}): Readable;
	/** Download a cover image and turn it into a 1000×1000 JPEG (in memory). */
	fetchCover(input: { url: string; signal: AbortSignal }): Promise<Buffer>;
	/** Versions of the external binaries, for the health check. */
	versions(): Promise<{ ytDlp: string; ffmpeg: string }>;
}

export interface ProbeResult {
	title: string;
	/** Seconds, or `null` when yt-dlp couldn't tell. */
	durationSeconds: number | null;
	/** Live, upcoming, or still-processing streams can't be downloaded as a file. */
	isLive: boolean;
	/** Codec of the audio that will be fetched, e.g. `opus` or `mp3` (copied as is). */
	sourceCodec: string | null;
	/** yt-dlp's info JSON, handed back to it for the download. */
	infoJson: string;
}

export interface TrackTags {
	title: string;
	artist: string;
	album: string;
	trackNumber: number;
	trackTotal: number;
	year?: string;
	genre?: string;
	/** JPEG bytes for the front cover. */
	cover?: Buffer;
}
