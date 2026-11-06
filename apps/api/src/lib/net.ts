import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { isIP } from "node:net";
import { UserFacingError } from "./errors.ts";

function ipv4ToInt(address: string): number {
	return (
		address
			.split(".")
			.reduce((acc, octet) => (acc << 8) + Number.parseInt(octet, 10), 0) >>> 0
	);
}

/** [network, prefix length] for IPv4 ranges a public fetch must never reach. */
const BLOCKED_V4: ReadonlyArray<readonly [string, number]> = [
	["0.0.0.0", 8], // "this" network
	["10.0.0.0", 8], // private
	["100.64.0.0", 10], // carrier-grade NAT
	["127.0.0.0", 8], // loopback
	["169.254.0.0", 16], // link-local, cloud metadata (169.254.169.254)
	["172.16.0.0", 12], // private
	["192.0.0.0", 24], // IETF protocol assignments
	["192.0.2.0", 24], // documentation
	["192.168.0.0", 16], // private
	["198.18.0.0", 15], // benchmarking
	["198.51.100.0", 24], // documentation
	["203.0.113.0", 24], // documentation
	["224.0.0.0", 4], // multicast
	["240.0.0.0", 4], // reserved + broadcast
];

function isBlockedV4(address: string): boolean {
	const ip = ipv4ToInt(address);
	return BLOCKED_V4.some(([network, bits]) => {
		const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
		return (ip & mask) === (ipv4ToInt(network) & mask);
	});
}

function isBlockedV6(address: string): boolean {
	const lower = address.toLowerCase();
	// IPv4-mapped (::ffff:127.0.0.1) and NAT64 (64:ff9b::7f00:1) carry a v4 address.
	const mapped = lower.match(/^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
	if (mapped?.[1]) return isBlockedV4(mapped[1]);
	if (lower === "::" || lower === "::1") return true;
	const first = Number.parseInt(lower.split(":")[0] || "0", 16);
	return (
		(first & 0xfe00) === 0xfc00 || // fc00::/7 unique local
		(first & 0xffc0) === 0xfe80 || // fe80::/10 link-local
		(first & 0xff00) === 0xff00 || // ff00::/8 multicast
		lower.startsWith("::ffff:") || // other mapped forms
		lower.startsWith("64:ff9b:") // NAT64
	);
}

/** True for loopback, private, link-local, multicast and other non-public addresses. */
export function isPrivateAddress(address: string): boolean {
	const version = isIP(address);
	if (version === 4) return isBlockedV4(address);
	if (version === 6) return isBlockedV6(address);
	return true;
}

type LookupCallback = (
	error: NodeJS.ErrnoException | null,
	address: string | LookupAddress[],
	family?: number,
) => void;

/**
 * A drop-in `lookup` for `http.request` that refuses non-public addresses.
 * Because the check runs on the address actually used for the connection,
 * DNS rebinding (public answer first, private answer later) can't slip past it.
 */
export function publicOnlyLookup(
	hostname: string,
	options: { all?: boolean },
	callback: LookupCallback,
): void {
	dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
		if (error) {
			callback(error, []);
			return;
		}
		const blocked = addresses.find((entry) => isPrivateAddress(entry.address));
		if (blocked || addresses.length === 0) {
			callback(
				new UserFacingError(
					"Cover image URL points to a private network address",
				),
				[],
			);
			return;
		}
		if (options.all) {
			callback(null, addresses);
		} else {
			const first = addresses[0] as LookupAddress;
			callback(null, first.address, first.family);
		}
	});
}
