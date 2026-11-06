import type { IncomingMessage } from "node:http";
import type { LookupFunction } from "node:net";
import { MAX_COVER_BYTES } from "@tagtape/shared";
import sharp from "sharp";
import { UserFacingError } from "../lib/errors.ts";
import { openPublicUrl } from "../lib/http.ts";

export const COVER_SIZE = 1000;
const TIMEOUT_MS = 15_000;
const LABEL = "Cover image URL";

export interface DownloadOptions {
	signal: AbortSignal;
	maxBytes?: number;
	/** DNS lookup used for every connection. Defaults to one that blocks private networks. */
	lookup?: LookupFunction;
}

/**
 * Downloads an image with a size cap, a timeout, a redirect limit and SSRF
 * protection (see `openPublicUrl`).
 */
export async function downloadImage(
	url: string,
	options: DownloadOptions,
): Promise<Buffer> {
	const timeout = AbortSignal.timeout(TIMEOUT_MS);
	const signal = AbortSignal.any([options.signal, timeout]);
	const maxBytes = options.maxBytes ?? MAX_COVER_BYTES;

	let response: IncomingMessage;
	try {
		response = await openPublicUrl(url, {
			signal,
			accept: "image/*",
			label: LABEL,
			...(options.lookup ? { lookup: options.lookup } : {}),
		});
	} catch (error) {
		if (timeout.aborted) {
			throw new UserFacingError("Cover image download timed out");
		}
		throw error;
	}
	const type = response.headers["content-type"] ?? "";
	if (!type.toLowerCase().startsWith("image/")) {
		response.resume();
		throw new UserFacingError("Cover image URL doesn't point to an image");
	}
	const declared = Number(response.headers["content-length"]);
	if (Number.isFinite(declared) && declared > maxBytes) {
		response.destroy();
		throw tooLarge(maxBytes);
	}
	return readCapped(response, maxBytes);
}

async function readCapped(
	response: IncomingMessage,
	maxBytes: number,
): Promise<Buffer> {
	const chunks: Buffer[] = [];
	let total = 0;
	try {
		for await (const chunk of response) {
			total += (chunk as Buffer).length;
			if (total > maxBytes) {
				response.destroy();
				throw tooLarge(maxBytes);
			}
			chunks.push(chunk as Buffer);
		}
	} catch (error) {
		if (error instanceof UserFacingError) throw error;
		throw new UserFacingError("Couldn't download the cover image");
	}
	return Buffer.concat(chunks);
}

function tooLarge(maxBytes: number): UserFacingError {
	return new UserFacingError(
		`Cover image is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`,
	);
}

/**
 * Square 1000×1000 JPEG, centre-cropped (TagTape v1 stretched non-square images).
 * EXIF orientation is applied first so phone photos aren't sideways.
 */
export async function processCover(input: Buffer): Promise<Buffer> {
	try {
		return await sharp(input, { failOn: "error" })
			.rotate()
			.resize(COVER_SIZE, COVER_SIZE, { fit: "cover", position: "centre" })
			.flatten({ background: "#ffffff" })
			.jpeg({ quality: 90, mozjpeg: true })
			.toBuffer();
	} catch {
		throw new UserFacingError("Cover image couldn't be read as an image");
	}
}

export async function fetchCover(input: {
	url: string;
	signal: AbortSignal;
}): Promise<Buffer> {
	return processCover(await downloadImage(input.url, { signal: input.signal }));
}
