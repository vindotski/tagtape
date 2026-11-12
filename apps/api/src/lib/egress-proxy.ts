/**
 * A local forward proxy for tools that fetch user-supplied links themselves
 * (yt-dlp, and the ffmpeg it starts for HLS), where `openPublicUrl` can't
 * help. Every connection, redirects included (the tool makes a new request
 * for each hop), must reach a public address on port 80 or 443.
 *
 * - `CONNECT host:443` (https): tunnelled after the check.
 * - `GET http://host/…` (plain http): forwarded after the check, on a fresh
 *   connection (no pooled socket skips the lookup).
 *
 * It listens on 127.0.0.1 only, on a random port. The check runs on the
 * address actually connected to, so DNS rebinding can't slip past it.
 */
import {
	createServer,
	request as httpRequest,
	type IncomingHttpHeaders,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import {
	type AddressInfo,
	connect,
	isIP,
	type LookupFunction,
	type Socket,
} from "node:net";
import type { Duplex } from "node:stream";
import { isPrivateAddress, publicOnlyLookup } from "./net.ts";

export interface EgressProxyOptions {
	/** Defaults to one that refuses non-public addresses. */
	lookup?: LookupFunction;
	/** Destination ports allowed. Default: 80 and 443. */
	ports?: ReadonlySet<number>;
	/** Close a connection with no traffic for this long. */
	idleTimeoutMs?: number;
	/** Tunnels and forwarded requests open at once. */
	maxConnections?: number;
	log?: { warn(obj: object, msg: string): void };
}

export interface EgressProxy {
	/** `http://127.0.0.1:<port>`, for `--proxy` / `-http_proxy`. */
	url: string;
	close(): Promise<void>;
}

const DEFAULT_PORTS: ReadonlySet<number> = new Set([80, 443]);

/** Request headers meant for the proxy itself, or only for one hop. */
const HOP_BY_HOP = new Set([
	"connection",
	"keep-alive",
	"proxy-authorization",
	"proxy-connection",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
]);

class Refused extends Error {}

export async function startEgressProxy(
	options: EgressProxyOptions = {},
): Promise<EgressProxy> {
	const lookup =
		options.lookup ?? (publicOnlyLookup as unknown as LookupFunction);
	const ports = options.ports ?? DEFAULT_PORTS;
	const idleTimeoutMs = options.idleTimeoutMs ?? 60_000;
	const sockets = new Set<Duplex>();

	/** The address to connect to, or `Refused`. */
	function resolveTarget(host: string, port: number): Promise<string> {
		if (!ports.has(port)) {
			return Promise.reject(new Refused(`port ${port} not allowed`));
		}
		const bare = host.replace(/^\[|\]$/g, "");
		// IP literals never go through `lookup`: check them here.
		if (isIP(bare)) {
			return isPrivateAddress(bare)
				? Promise.reject(new Refused("private address"))
				: Promise.resolve(bare);
		}
		return new Promise((resolve, reject) => {
			lookup(bare, {}, (error, address) => {
				if (error || typeof address !== "string") {
					reject(new Refused("host refused or unknown"));
				} else {
					resolve(address);
				}
			});
		});
	}

	function track(socket: Duplex): boolean {
		if (
			options.maxConnections !== undefined &&
			sockets.size >= options.maxConnections
		) {
			return false;
		}
		sockets.add(socket);
		socket.once("close", () => sockets.delete(socket));
		return true;
	}

	const server = createServer((req, res) => {
		void forward(req, res);
	});

	async function forward(req: IncomingMessage, res: ServerResponse) {
		let target: URL;
		try {
			target = new URL(req.url ?? "");
		} catch {
			res.writeHead(400).end();
			return;
		}
		if (target.protocol !== "http:" || target.username || target.password) {
			res.writeHead(400).end();
			return;
		}
		const port = Number(target.port || 80);
		let address: string;
		try {
			address = await resolveTarget(target.hostname, port);
		} catch (error) {
			refuse(target.host, error);
			res.writeHead(403).end();
			return;
		}
		const headers: IncomingHttpHeaders = {};
		for (const [name, value] of Object.entries(req.headers)) {
			if (!HOP_BY_HOP.has(name)) headers[name] = value;
		}
		const upstream = httpRequest(
			{
				host: address,
				port,
				method: req.method,
				path: `${target.pathname}${target.search}`,
				headers: { ...headers, host: target.host },
				agent: false,
				timeout: idleTimeoutMs,
			},
			(response) => {
				res.writeHead(response.statusCode ?? 502, response.headers);
				response.pipe(res);
			},
		);
		upstream.once("timeout", () => upstream.destroy());
		upstream.once("error", () => {
			if (!res.headersSent) res.writeHead(502).end();
			else res.destroy();
		});
		res.once("close", () => upstream.destroy());
		req.pipe(upstream);
	}

	server.on("connect", (req: IncomingMessage, client: Duplex, head: Buffer) => {
		// The same socket as the "connection" one: already tracked and timed.
		client.on("error", () => client.destroy());
		void tunnel(req.url ?? "", client, head);
	});

	async function tunnel(authority: string, client: Duplex, head: Buffer) {
		const match = /^(\[[^\]]+\]|[^:]+):(\d+)$/.exec(authority);
		if (!match) {
			client.end("HTTP/1.1 400 Bad Request\r\n\r\n");
			return;
		}
		const [, host = "", portText = ""] = match;
		let address: string;
		try {
			address = await resolveTarget(host, Number(portText));
		} catch (error) {
			refuse(authority, error);
			client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
			return;
		}
		if (client.destroyed) return;
		const upstream: Socket = connect({ host: address, port: Number(portText) });
		upstream.setTimeout(idleTimeoutMs, () => upstream.destroy());
		const closeBoth = () => {
			upstream.destroy();
			client.destroy();
		};
		upstream.once("error", closeBoth);
		upstream.once("close", closeBoth);
		client.once("close", closeBoth);
		upstream.once("connect", () => {
			client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
			if (head.length > 0) upstream.write(head);
			upstream.pipe(client);
			client.pipe(upstream);
		});
	}

	function refuse(target: string, error: unknown) {
		const reason = error instanceof Refused ? error.message : String(error);
		options.log?.warn({ target, reason }, "Egress proxy refused a connection");
	}

	server.on("connection", (socket) => {
		if (!track(socket)) socket.destroy();
		socket.setTimeout(idleTimeoutMs, () => socket.destroy());
	});

	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => resolve());
	});
	const { port } = server.address() as AddressInfo;

	return {
		url: `http://127.0.0.1:${port}`,
		close() {
			for (const socket of sockets) socket.destroy();
			return new Promise((resolve) => server.close(() => resolve()));
		},
	};
}
