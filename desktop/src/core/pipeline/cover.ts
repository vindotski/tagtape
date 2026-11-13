import type { IncomingMessage } from "node:http";
import type { LookupFunction } from "node:net";
import { MAX_COVER_BYTES } from "@tagtape/shared";
import sharp, { type Metadata } from "sharp";
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
	/** For tests: the port of a local test server. */
	testPort?: string;
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
			...(options.testPort ? { testPort: options.testPort } : {}),
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

/** Formats we decode; SVG, GIF, TIFF, HEIF etc. are refused (smaller attack surface). */
const COVER_FORMATS = new Set(["jpeg", "png", "webp"]);
/** A 5 MB file can still decode to gigabytes: cap the pixels, not just the bytes. */
export const MAX_COVER_PIXELS = 40_000_000;

// One decode at a time per process: covers are small, and parallel checks
// shouldn't multiply CPU and memory use.
sharp.concurrency(1);

/**
 * Square 1000×1000 JPEG, centre-cropped (TagTape v1 stretched non-square images).
 * EXIF orientation is applied first so phone photos aren't sideways.
 */
export async function processCover(input: Buffer): Promise<Buffer> {
	let metadata: Metadata;
	try {
		// Reads the header only: nothing is decoded yet.
		metadata = await sharp(input).metadata();
	} catch {
		throw new UserFacingError("Cover image couldn't be read as an image");
	}
	if (!COVER_FORMATS.has(metadata.format ?? "")) {
		throw new UserFacingError("Cover image must be a JPEG, PNG or WebP");
	}
	if ((metadata.width ?? 0) * (metadata.height ?? 0) > MAX_COVER_PIXELS) {
		throw new UserFacingError("Cover image has too many pixels");
	}
	try {
		return await sharp(input, {
			failOn: "error",
			limitInputPixels: MAX_COVER_PIXELS,
		})
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
