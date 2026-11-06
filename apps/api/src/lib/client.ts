import { isIP } from "node:net";
import { v6Groups } from "./net.ts";

/** Requests without a client address (direct API use, tests) share this key. */
export const LOCAL_CLIENT = "local";

/**
 * The key per-client limits count by, from the `x-tagtape-client` header the
 * web app sets (the browser's address; the API itself is internal).
 * IPv4 is used as is; IPv6 is grouped by /64, the smallest block a single
 * user normally gets, so rotating addresses within it doesn't help.
 */
export function clientKey(value: string | undefined): string {
	const ip = value?.trim() ?? "";
	const version = isIP(ip);
	if (version === 4) return ip;
	if (version === 6) {
		const groups = v6Groups(ip);
		const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0] = groups;
		// IPv4-mapped (::ffff:a.b.c.d): the IPv4 address it carries.
		if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0xffff) {
			return `${g >> 8}.${g & 0xff}.${h >> 8}.${h & 0xff}`;
		}
		return `${[a, b, c, d].map((group) => group.toString(16)).join(":")}::/64`;
	}
	return LOCAL_CLIENT;
}
