import { z } from "zod";
import {
	MAX_ARTIST_LENGTH,
	MAX_GENRE_LENGTH,
	MAX_TITLE_LENGTH,
	MAX_TRACKS,
} from "./limits.ts";
import { parseWebUrl } from "./web-url.ts";

const requiredText = (label: string, max: number) =>
	z
		.string()
		.trim()
		.min(1, { error: `${label} is required` })
		.max(max, { error: `${label} must be at most ${max} characters` });

/** Optional form text: blank input becomes `undefined`. */
const optionalText = <T extends z.ZodType<string | undefined>>(schema: T) =>
	z.preprocess(
		(value) =>
			typeof value === "string" && value.trim() === "" ? undefined : value,
		schema.optional(),
	);

export const trackInputSchema = z.object({
	title: requiredText("Title", MAX_TITLE_LENGTH),
	url: z
		.string()
		.trim()
		.min(1, { error: "Track link is required" })
		// Only the shape is checked here (it runs in the browser too). Which
		// links work depends on the server's sources, which also canonicalise them.
		.refine((value) => parseWebUrl(value) !== null, {
			error: "Enter a web link (https://…)",
		})
		.transform((value) => (parseWebUrl(value) as URL).href),
});

export const albumInputSchema = z.object({
	title: requiredText("Album title", MAX_TITLE_LENGTH),
	artist: requiredText("Artist", MAX_ARTIST_LENGTH),
	genre: optionalText(
		z
			.string()
			.trim()
			.max(MAX_GENRE_LENGTH, {
				error: `Genre must be at most ${MAX_GENRE_LENGTH} characters`,
			}),
	),
	year: optionalText(
		z
			.string()
			.trim()
			.regex(/^\d{4}$/, { error: "Year must be four digits" }),
	),
	coverUrl: optionalText(
		z.url({
			protocol: /^https?$/,
			error: "Cover must be an http(s) image URL",
		}),
	),
	tracks: z
		.array(trackInputSchema)
		.min(1, { error: "Add at least one track" })
		.max(MAX_TRACKS, { error: `You can add up to ${MAX_TRACKS} tracks` }),
});

/** What a client sends (raw form values). */
export type AlbumInput = z.input<typeof albumInputSchema>;
/** What the server works with after validation: trimmed, blanks removed, URLs normalised. */
export type Album = z.output<typeof albumInputSchema>;
export type Track = z.output<typeof trackInputSchema>;
