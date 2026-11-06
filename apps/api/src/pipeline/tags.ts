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
 * Replaces the file's tag with an ID3v2.3 tag (node-id3 writes v2.3, which old
 * MP3 players and car stereos read more reliably than v2.4).
 */
export async function writeTags(
	mp3Path: string,
	tags: TrackTags,
): Promise<void> {
	await NodeID3.Promise.write(toId3(tags), mp3Path);
}
