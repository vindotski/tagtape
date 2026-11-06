/**
 * Everything the job runner needs from the outside world (yt-dlp, the network,
 * the file system), behind one interface so the runner can be tested with
 * fakes. Same idea as the legacy app's Downloader / TagWriter interfaces.
 */
export interface Pipeline {
	/** Fetch metadata for one video and save it as `infoPath` for the download step. */
	probe(input: {
		url: string;
		infoPath: string;
		signal: AbortSignal;
	}): Promise<ProbeResult>;
	/**
	 * Download the audio described by `infoPath` and convert it to MP3.
	 * Resolves with the MP3 path. `onConverting` fires when download ends and ffmpeg starts.
	 */
	downloadAudio(input: {
		infoPath: string;
		workDir: string;
		baseName: string;
		signal: AbortSignal;
		onConverting: () => void;
	}): Promise<string>;
	/** Download a cover image and turn it into a 1000×1000 JPEG. */
	fetchCover(input: { url: string; signal: AbortSignal }): Promise<Buffer>;
	writeTags(mp3Path: string, tags: TrackTags): Promise<void>;
	writeArchive(input: {
		entries: ArchiveEntry[];
		outPath: string;
		signal: AbortSignal;
	}): Promise<void>;
	/** Versions of the external binaries, for the health check. */
	versions(): Promise<{ ytDlp: string; ffmpeg: string }>;
}

export interface ProbeResult {
	title: string;
	/** Seconds, or `null` when yt-dlp couldn't tell. */
	durationSeconds: number | null;
	/** Live, upcoming, or still-processing streams can't be downloaded as a file. */
	isLive: boolean;
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

export interface ArchiveEntry {
	/** File on disk. */
	path: string;
	/** Name inside the ZIP. */
	name: string;
}
