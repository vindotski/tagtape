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

/** The 8 groups of an IPv6 address (handles `::` and a dotted IPv4 tail). */
export function v6Groups(address: string): number[] {
	let text = address.toLowerCase();
	const v4 = text.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
	if (v4) {
		const [a, b, c, d] = v4.slice(1).map(Number) as [
			number,
			number,
			number,
			number,
		];
		text = `${text.slice(0, v4.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
	}
	const [head = "", tail] = text.split("::");
	const left = head ? head.split(":") : [];
	const right = tail ? tail.split(":") : [];
	const zeros =
		tail === undefined ? [] : Array(8 - left.length - right.length).fill("0");
	return [...left, ...zeros, ...right].map(
		(group) => Number.parseInt(group, 16) || 0,
	);
}

function isBlockedV6(address: string): boolean {
	const [
		first = 0,
		second = 0,
		g2 = 0,
		g3 = 0,
		g4 = 0,
		g5 = 0,
		g6 = 0,
		g7 = 0,
	] = v6Groups(address);
	// IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::a.b.c.d) carry a v4
	// address in the last two groups: judge that one.
	const embedded = `${g6 >> 8}.${g6 & 0xff}.${g7 >> 8}.${g7 & 0xff}`;
	const mapped =
		first === 0 &&
		second === 0 &&
		g2 === 0 &&
		g3 === 0 &&
		g4 === 0 &&
		g5 === 0xffff;
	if (mapped || (first === 0x64 && second === 0xff9b)) {
		return isBlockedV4(embedded);
	}
	return (
		first === 0 || // ::/16: unspecified, loopback, IPv4-compatible and other reserved forms
		(first & 0xff00) === 0x0100 || // 0100::/8 reserved, incl. 100::/64 discard
		(first === 0x2001 && second === 0) || // 2001::/32 Teredo
		(first === 0x2001 && second === 0x0db8) || // 2001:db8::/32 documentation
		first === 0x2002 || // 2002::/16 6to4 (embeds an IPv4 address)
		(first & 0xfe00) === 0xfc00 || // fc00::/7 unique local
		(first & 0xffc0) === 0xfe80 || // fe80::/10 link-local
		(first & 0xff00) === 0xff00 // ff00::/8 multicast
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
				// Same as "doesn't exist" (see lib/http.ts): no hint about which
				// internal host names exist.
				new UserFacingError("This link couldn't be reached"),
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
