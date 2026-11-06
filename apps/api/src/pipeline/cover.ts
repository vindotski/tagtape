import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";
import { MAX_COVER_BYTES } from "@tagtape/shared";
import sharp from "sharp";
import { UserFacingError } from "../lib/errors.ts";
import { publicOnlyLookup } from "../lib/net.ts";

export const COVER_SIZE = 1000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 15_000;
const USER_AGENT = "TagTape/1.0 (+https://tagtape.app)";

export interface DownloadOptions {
	signal: AbortSignal;
	maxBytes?: number;
	/** DNS lookup used for every connection. Defaults to one that blocks private networks. */
	lookup?: LookupFunction;
}

/**
 * Downloads an image with a size cap, a timeout, a redirect limit and SSRF
 * protection (every hop, including redirects, must resolve to a public address).
 */
export async function downloadImage(
	url: string,
	options: DownloadOptions,
): Promise<Buffer> {
	const signal = AbortSignal.any([
		options.signal,
		AbortSignal.timeout(TIMEOUT_MS),
	]);
	const maxBytes = options.maxBytes ?? MAX_COVER_BYTES;
	const lookup =
		options.lookup ?? (publicOnlyLookup as unknown as LookupFunction);

	let current = new URL(url);
	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		if (current.protocol !== "http:" && current.protocol !== "https:") {
			throw new UserFacingError("Cover image URL must use http or https");
		}
		const response = await get(current, lookup, signal);
		const status = response.statusCode ?? 0;

		if (status >= 300 && status < 400 && response.headers.location) {
			response.resume();
			current = new URL(response.headers.location, current);
			continue;
		}
		if (status !== 200) {
			response.resume();
			throw new UserFacingError(`Cover image URL answered with HTTP ${status}`);
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
	throw new UserFacingError("Cover image URL redirects too many times");
}

function get(
	url: URL,
	lookup: LookupFunction,
	signal: AbortSignal,
): Promise<IncomingMessage> {
	const request = url.protocol === "https:" ? httpsRequest : httpRequest;
	return new Promise((resolve, reject) => {
		const req = request(
			url,
			{
				method: "GET",
				lookup,
				signal,
				// Many image hosts (Wikimedia, some CDNs) answer 403 without a User-Agent.
				headers: { accept: "image/*", "user-agent": USER_AGENT },
			},
			resolve,
		);
		req.once("error", (error) => {
			if (error instanceof UserFacingError) reject(error);
			else if (signal.aborted)
				reject(new UserFacingError("Cover image download timed out"));
			else reject(new UserFacingError("Couldn't download the cover image"));
		});
		req.end();
	});
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
