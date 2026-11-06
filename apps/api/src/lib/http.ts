import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";
import { isIP } from "node:net";
import { UserFacingError } from "./errors.ts";
import { isPrivateAddress, publicOnlyLookup } from "./net.ts";

const MAX_REDIRECTS = 3;
const USER_AGENT = "TagTape/2 (+https://tagtape.app)";

export interface OpenUrlOptions {
	signal: AbortSignal;
	/** `accept` request header. */
	accept: string;
	/** How messages name the URL, e.g. "Cover image URL" or "Track link". */
	label: string;
	/** DNS lookup used for every connection. Defaults to one that blocks private networks. */
	lookup?: LookupFunction;
}

/**
 * GETs a user-supplied URL and returns the `200` response, with its body not
 * yet read. SSRF-safe: every hop, redirects included, must resolve to a public
 * address, only http(s) is allowed, and redirects are capped.
 *
 * Every failure is a `UserFacingError` naming the URL by `label`.
 */
export async function openPublicUrl(
	url: string,
	options: OpenUrlOptions,
): Promise<IncomingMessage> {
	const lookup =
		options.lookup ?? (publicOnlyLookup as unknown as LookupFunction);
	let current = new URL(url);
	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		if (current.protocol !== "http:" && current.protocol !== "https:") {
			throw new UserFacingError(`${options.label} must use http or https`);
		}
		// Node skips `lookup` for IP-literal hosts (http://169.254.169.254/…),
		// so those are checked here, on every hop.
		const host = current.hostname.replace(/^\[|\]$/g, "");
		if (isIP(host) && isPrivateAddress(host)) {
			throw new UserFacingError(
				"This link points to a private network address",
			);
		}
		const response = await get(current, lookup, options);
		const status = response.statusCode ?? 0;
		if (status >= 300 && status < 400 && response.headers.location) {
			response.resume();
			current = new URL(response.headers.location, current);
			continue;
		}
		if (status !== 200) {
			response.resume();
			throw new UserFacingError(
				`${options.label} answered with HTTP ${status}`,
			);
		}
		return response;
	}
	throw new UserFacingError(`${options.label} redirects too many times`);
}

function get(
	url: URL,
	lookup: LookupFunction,
	{ signal, accept, label }: OpenUrlOptions,
): Promise<IncomingMessage> {
	const request = url.protocol === "https:" ? httpsRequest : httpRequest;
	return new Promise((resolve, reject) => {
		const req = request(
			url,
			{
				method: "GET",
				lookup,
				// A fresh connection per request: a pooled keep-alive socket would skip
				// `lookup`, and with it the private-address check.
				agent: false,
				signal,
				// Many hosts (Wikimedia, some CDNs) answer 403 without a User-Agent.
				headers: { accept, "user-agent": USER_AGENT },
			},
			resolve,
		);
		req.once("error", (error) => {
			if (error instanceof UserFacingError) reject(error);
			else if (signal.aborted) reject(signal.reason ?? error);
			else reject(new UserFacingError(`${label} couldn't be reached`));
		});
		req.end();
	});
}
