/**
 * Just enough MP3 parsing to check a remote file before converting it: skip
 * the ID3v2 tag, find the first MPEG audio frame, and read its Xing/Info or
 * VBRI header. Works on the first few KB after the tag, so a probe never
 * downloads the audio.
 */

/** Bytes after the tag that must be available to find and check the first frame. */
export const HEADER_WINDOW = 8 * 1024;

/** Total size of an ID3v2 tag at the start of `buf` (0 if none); needs 10 bytes. */
export function id3v2Size(buf: Uint8Array): number {
	if (buf.length < 10 || buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33)
		return 0; // "ID3"
	const size =
		((buf[6] as number) << 21) |
		((buf[7] as number) << 14) |
		((buf[8] as number) << 7) |
		(buf[9] as number);
	const footer = ((buf[5] as number) & 0x10) !== 0 ? 10 : 0;
	return 10 + size + footer;
}

const BITRATES_V1 = [
	0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
];
const BITRATES_V2 = [
	0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160,
];
const SAMPLE_RATES: Record<number, number[]> = {
	3: [44100, 48000, 32000], // MPEG 1
	2: [22050, 24000, 16000], // MPEG 2
	0: [11025, 12000, 8000], // MPEG 2.5
};

interface FrameHeader {
	mpeg1: boolean;
	bitrateKbps: number;
	sampleRate: number;
	mono: boolean;
	length: number;
	samplesPerFrame: number;
}

/** An MPEG Layer III frame header at `offset`, or `null`. */
function frameAt(buf: Uint8Array, offset: number): FrameHeader | null {
	if (offset + 4 > buf.length) return null;
	const b1 = buf[offset + 1] as number;
	const b2 = buf[offset + 2] as number;
	const b3 = buf[offset + 3] as number;
	if (buf[offset] !== 0xff || (b1 & 0xe0) !== 0xe0) return null;
	const version = (b1 >> 3) & 0x03;
	const layer = (b1 >> 1) & 0x03;
	if (version === 1 || layer !== 1) return null; // reserved version, or not Layer III
	const mpeg1 = version === 3;
	const bitrateKbps = (mpeg1 ? BITRATES_V1 : BITRATES_V2)[b2 >> 4];
	const sampleRate = SAMPLE_RATES[version]?.[(b2 >> 2) & 0x03];
	if (!bitrateKbps || !sampleRate) return null; // "free" or bad bitrate, reserved rate
	const padding = (b2 >> 1) & 0x01;
	const samplesPerFrame = mpeg1 ? 1152 : 576;
	return {
		mpeg1,
		bitrateKbps,
		sampleRate,
		mono: b3 >> 6 === 3,
		length:
			Math.floor(((samplesPerFrame / 8) * bitrateKbps * 1000) / sampleRate) +
			padding,
		samplesPerFrame,
	};
}

export interface Mp3Info {
	/** Where the first audio frame starts (after the ID3v2 tag). */
	audioOffset: number;
	bitrateKbps: number;
	sampleRate: number;
	/** Variable bitrate (a Xing or VBRI header says so). */
	vbr: boolean;
	/** Seconds, or `null` when it can't be told without reading the whole file. */
	durationSeconds: number | null;
}

/**
 * Reads the start of an MP3 file: `buf` holds the first bytes (the tag plus
 * `HEADER_WINDOW`), `totalBytes` is the file size if known. `null` when it
 * isn't MPEG Layer III audio.
 *
 * `skipped`: when the caller already skipped the ID3v2 tag without keeping it
 * (so a big embedded cover isn't buffered), `buf` starts right after the tag
 * and `skipped` is the tag's size.
 */
export function readMp3Info(
	buf: Uint8Array,
	totalBytes: number | null,
	skipped = 0,
): Mp3Info | null {
	const tag = skipped > 0 ? 0 : id3v2Size(buf);
	// Some files have a little padding or junk between the tag and the audio.
	const searchEnd = Math.min(buf.length - 4, tag + 4096);
	for (let offset = tag; offset <= searchEnd; offset++) {
		const frame = frameAt(buf, offset);
		if (!frame) continue;
		// A real stream has another frame right after this one (avoids false syncs).
		const next = offset + frame.length;
		if (next + 4 <= buf.length && !frameAt(buf, next)) continue;
		return describe(buf, offset, frame, totalBytes, skipped);
	}
	return null;
}

function describe(
	buf: Uint8Array,
	offset: number,
	frame: FrameHeader,
	totalBytes: number | null,
	skipped: number,
): Mp3Info {
	const ascii = (at: number) =>
		String.fromCharCode(...buf.subarray(at, at + 4));
	const u32 = (at: number) =>
		at + 4 <= buf.length
			? new DataView(buf.buffer, buf.byteOffset + at, 4).getUint32(0)
			: null;
	const secondsFor = (frames: number | null) =>
		frames
			? Math.round((frames * frame.samplesPerFrame) / frame.sampleRate)
			: null;

	// Xing ("Xing" = VBR, "Info" = CBR) sits after the side information.
	const sideInfo = frame.mpeg1 ? (frame.mono ? 17 : 32) : frame.mono ? 9 : 17;
	const xing = offset + 4 + sideInfo;
	const xingTag = ascii(xing);
	const base = {
		audioOffset: skipped + offset,
		bitrateKbps: frame.bitrateKbps,
		sampleRate: frame.sampleRate,
	};
	if (xingTag === "Xing" || xingTag === "Info") {
		const flags = u32(xing + 4) ?? 0;
		const frames = flags & 0x1 ? u32(xing + 8) : null;
		const vbr = xingTag === "Xing";
		const durationSeconds =
			secondsFor(frames) ??
			(vbr ? null : cbrSeconds(frame, skipped + offset, totalBytes));
		return { ...base, vbr, durationSeconds };
	}
	// Fraunhofer's VBRI header: always 32 bytes after the frame header.
	if (ascii(offset + 36) === "VBRI") {
		return {
			...base,
			vbr: true,
			durationSeconds: secondsFor(u32(offset + 36 + 14)),
		};
	}
	return {
		...base,
		vbr: false,
		durationSeconds: cbrSeconds(frame, skipped + offset, totalBytes),
	};
}

function cbrSeconds(
	frame: FrameHeader,
	audioOffset: number,
	totalBytes: number | null,
): number | null {
	if (totalBytes === null || totalBytes <= audioOffset) return null;
	return Math.round(
		((totalBytes - audioOffset) * 8) / (frame.bitrateKbps * 1000),
	);
}
