// A small ID3v2.3 writer on Uint8Array, so the same code tags tracks in
// Node (desktop) and on Hermes (mobile). v2.3 because old MP3 players and
// car stereos read it more reliably than v2.4.

export interface TrackTags {
	title: string;
	artist: string;
	album: string;
	trackNumber: number;
	trackTotal: number;
	year?: string;
	genre?: string;
	/** JPEG bytes for the front cover. */
	cover?: Uint8Array;
}

/** APIC picture type 3: "Cover (front)". */
const FRONT_COVER = 3;

/** A text frame's body: UTF-16 with a byte-order mark, v2.3's Unicode encoding. */
function text(value: string): Uint8Array {
	const out = new Uint8Array(3 + value.length * 2);
	out[0] = 0x01;
	out[1] = 0xff;
	out[2] = 0xfe;
	for (let i = 0; i < value.length; i++) {
		const unit = value.charCodeAt(i);
		out[3 + i * 2] = unit & 0xff;
		out[4 + i * 2] = unit >> 8;
	}
	return out;
}

function frame(id: string, body: Uint8Array): Uint8Array {
	const out = new Uint8Array(10 + body.length);
	for (let i = 0; i < 4; i++) out[i] = id.charCodeAt(i);
	// v2.3 frame sizes are plain 32-bit integers (v2.4 made them sync-safe).
	new DataView(out.buffer).setUint32(4, body.length);
	out.set(body, 10);
	return out;
}

function picture(jpeg: Uint8Array): Uint8Array {
	const mime = "image/jpeg";
	const body = new Uint8Array(1 + mime.length + 3 + jpeg.length);
	let at = 0;
	body[at++] = 0x00; // ISO-8859-1, for the empty description
	for (let i = 0; i < mime.length; i++) body[at++] = mime.charCodeAt(i);
	body[at++] = 0x00;
	body[at++] = FRONT_COVER;
	body[at++] = 0x00; // empty description
	body.set(jpeg, at);
	return frame("APIC", body);
}

/**
 * The complete ID3v2.3 tag as bytes, written in front of the MP3 frames. It
 * is the only tag in the file: ffmpeg is told not to write any.
 */
export function createTag(tags: TrackTags): Uint8Array {
	const frames = [
		frame("TIT2", text(tags.title)),
		frame("TPE1", text(tags.artist)),
		// TPE2 "album artist": keeps the album grouped in players that sort by it.
		frame("TPE2", text(tags.artist)),
		frame("TALB", text(tags.album)),
		frame("TRCK", text(`${tags.trackNumber}/${tags.trackTotal}`)),
	];
	if (tags.year) frames.push(frame("TYER", text(tags.year)));
	if (tags.genre) frames.push(frame("TCON", text(tags.genre)));
	if (tags.cover) frames.push(picture(tags.cover));

	const size = frames.reduce((sum, f) => sum + f.length, 0);
	const out = new Uint8Array(10 + size);
	out.set([0x49, 0x44, 0x33, 0x03, 0x00, 0x00]); // "ID3", v2.3.0, no flags
	// The tag's own size is sync-safe: 7 bits per byte.
	out[6] = (size >> 21) & 0x7f;
	out[7] = (size >> 14) & 0x7f;
	out[8] = (size >> 7) & 0x7f;
	out[9] = size & 0x7f;
	let at = 10;
	for (const f of frames) {
		out.set(f, at);
		at += f.length;
	}
	return out;
}
