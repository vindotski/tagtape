import { createServer, request, type Server } from "node:http";
import { type AddressInfo, connect, type LookupFunction } from "node:net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type EgressProxy, startEgressProxy } from "./egress-proxy.ts";

let target: Server;
let targetPort: number;
let proxy: EgressProxy;

/** `public.test` stands for a public host (it's really the local test server). */
const testLookup = ((hostname: string, _options: unknown, callback) => {
	if (hostname === "public.test") callback(null, "127.0.0.1", 4);
	else callback(new Error("refused"), "", 0);
}) as LookupFunction;

beforeAll(async () => {
	target = createServer((req, res) => {
		res.writeHead(200, { "content-type": "text/plain" });
		res.end(`hello ${req.headers.host} ${req.url}`);
	});
	await new Promise<void>((resolve) => target.listen(0, "127.0.0.1", resolve));
	targetPort = (target.address() as AddressInfo).port;
	proxy = await startEgressProxy({
		lookup: testLookup,
		ports: new Set([targetPort, 443]),
	});
});

afterAll(async () => {
	await proxy.close();
	await new Promise((resolve) => target.close(resolve));
});

/** A plain-http request through the proxy (absolute-form URL). */
function viaProxy(url: string): Promise<{ status: number; body: string }> {
	const { port } = new URL(proxy.url);
	return new Promise((resolve, reject) => {
		const req = request(
			{ host: "127.0.0.1", port, path: url, agent: false },
			(res) => {
				let body = "";
				res.setEncoding("utf8");
				res.on("data", (chunk) => {
					body += chunk;
				});
				res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
			},
		);
		req.once("error", reject);
		req.end();
	});
}

/** Opens a CONNECT tunnel; resolves with the proxy's status line. */
function tunnel(authority: string): Promise<{ status: string; body: string }> {
	const { port } = new URL(proxy.url);
	return new Promise((resolve, reject) => {
		const socket = connect(Number(port), "127.0.0.1");
		let data = "";
		let sent = false;
		socket.setEncoding("utf8");
		socket.once("error", reject);
		socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`);
		socket.on("data", (chunk) => {
			data += chunk;
			// Once the tunnel is up, speak HTTP to the target through it.
			if (
				!sent &&
				data.startsWith("HTTP/1.1 200") &&
				data.includes("\r\n\r\n")
			) {
				sent = true;
				socket.write(
					"GET /through HTTP/1.1\r\nHost: public.test\r\nConnection: close\r\n\r\n",
				);
			}
		});
		socket.on("close", () =>
			resolve({ status: data.split("\r\n")[0] ?? "", body: data }),
		);
	});
}

describe("egress proxy", () => {
	test("forwards plain http to a public host", async () => {
		const res = await viaProxy(`http://public.test:${targetPort}/a?b=1`);
		expect(res.status).toBe(200);
		expect(res.body).toBe(`hello public.test:${targetPort} /a?b=1`);
	});

	test("refuses hosts that resolve to private addresses", async () => {
		const res = await viaProxy(`http://internal.test:${targetPort}/`);
		expect(res.status).toBe(403);
	});

	test("refuses private IP literals without a lookup", async () => {
		expect((await viaProxy(`http://127.0.0.1:${targetPort}/`)).status).toBe(
			403,
		);
		expect((await viaProxy("http://169.254.169.254/latest")).status).toBe(403);
		expect((await viaProxy(`http://[::1]:${targetPort}/`)).status).toBe(403);
	});

	test("refuses ports that aren't allowed", async () => {
		expect((await viaProxy("http://public.test:5432/")).status).toBe(403);
	});

	test("refuses requests that aren't proxy requests", async () => {
		expect((await viaProxy("/just-a-path")).status).toBe(400);
	});

	test("tunnels CONNECT to a public host", async () => {
		const res = await tunnel(`public.test:${targetPort}`);
		expect(res.status).toBe("HTTP/1.1 200 Connection Established");
		expect(res.body).toContain(`hello public.test /through`);
	});

	test("refuses CONNECT to private hosts and other ports", async () => {
		expect((await tunnel("internal.test:443")).status).toBe(
			"HTTP/1.1 403 Forbidden",
		);
		expect((await tunnel("10.0.0.5:443")).status).toBe(
			"HTTP/1.1 403 Forbidden",
		);
		expect((await tunnel("public.test:22")).status).toBe(
			"HTTP/1.1 403 Forbidden",
		);
		expect((await tunnel("nonsense")).status).toBe("HTTP/1.1 400 Bad Request");
	});
});
