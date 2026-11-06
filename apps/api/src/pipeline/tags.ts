import NodeID3 from "node-id3";
import type { TrackTags } from "./types.ts";

/** APIC picture type 3: "Cover (front)". */
const FRONT_COVER = 3;

export function toId3(tags: TrackTags): NodeID3.Tags {
	const id3: NodeID3.Tags = {
		title: tags.title,
		artist: tags.artist,
		// TPE2 "album artist": keeps the album grouped in players that sort by it.
		performerInfo: tags.artist,
		album: tags.album,
		trackNumber: `${tags.trackNumber}/${tags.trackTotal}`,
	};
	if (tags.year) id3.year = tags.year;
	if (tags.genre) id3.genre = tags.genre;
	if (tags.cover) {
		id3.image = {
			mime: "image/jpeg",
			type: { id: FRONT_COVER },
			description: "",
			imageBuffer: tags.cover,
		};
	}
	return id3;
}

/**
 * The complete ID3v2.3 tag as bytes, written in front of the streamed MP3
 * frames. The tag is the only one in the file: ffmpeg is told not to write
 * any. (node-id3 writes v2.3, which old MP3 players and car stereos read more
 * reliably than v2.4.)
 */
export function createTag(tags: TrackTags): Buffer {
	return NodeID3.create(toId3(tags));
}
