import { describe, expect, test } from "vitest";
import { childEnv, ExecError, run } from "./exec.ts";
import { isPrivateAddress } from "./net.ts";

describe("childEnv", () => {
	test("POSIX: a minimal environment, never the user's secrets", () => {
		expect(
			childEnv(
				{ PATH: "/bin", HOME: "/home/node", API_TOKEN: "secret", FOO: "x" },
				{},
				"linux",
			),
		).toEqual({ PATH: "/bin", HOME: "/home/node", LANG: "C.UTF-8" });
	});

	test("Windows: what programs need to start, whatever the case of Path", () => {
		expect(
			childEnv(
				{
					Path: "C:\\Windows\\System32",
					SystemRoot: "C:\\Windows",
					PATHEXT: ".COM;.EXE",
					TEMP: "C:\\Temp",
					USERPROFILE: "C:\\Users\\me",
					HTTPS_PROXY: "http://proxy.example.com",
					SECRET_TOKEN: "x",
				},
				{},
				"win32",
			),
		).toEqual({
			PATH: "C:\\Windows\\System32",
			SystemRoot: "C:\\Windows",
			PATHEXT: ".COM;.EXE",
			TEMP: "C:\\Temp",
			USERPROFILE: "C:\\Users\\me",
		});
	});

	test("a tool's own variables are added on top", () => {
		expect(
			childEnv({ PATH: "/bin" }, { ELECTRON_RUN_AS_NODE: "1" }, "darwin"),
		).toEqual({ PATH: "/bin", LANG: "C.UTF-8", ELECTRON_RUN_AS_NODE: "1" });
	});
});

describe("isPrivateAddress", () => {
	test.each([
		"127.0.0.1",
		"10.1.2.3",
		"172.16.0.1",
		"172.31.255.255",
		"192.168.1.1",
		"169.254.169.254",
		"100.64.0.1",
		"0.0.0.0",
		"224.0.0.1",
		"255.255.255.255",
		"::1",
		"::",
		"fd00::1",
		"fe80::1",
		"::ffff:127.0.0.1",
		"::ffff:10.0.0.1",
		"::ffff:a00:1", // the same, as Node's URL normalises it
		"::7f00:1", // IPv4-compatible (deprecated)
		"64:ff9b::7f00:1", // NAT64 → 127.0.0.1
		"100::1", // discard prefix
		"2001::1", // Teredo
		"2001:db8::1", // documentation
		"2002:7f00:1::1", // 6to4
		"not an ip",
	])("blocks %s", (address) => {
		expect(isPrivateAddress(address)).toBe(true);
	});

	test.each([
		"8.8.8.8",
		"142.250.74.14",
		"172.32.0.1",
		"2a00:1450:4001:80b::200e",
		"2001:4860:4860::8888", // public, despite starting with 2001
		"64:ff9b::808:808", // NAT64 → 8.8.8.8
		"::ffff:8.8.8.8",
	])("allows %s", (address) => {
		expect(isPrivateAddress(address)).toBe(false);
	});
});

describe("run", () => {
	const node = process.execPath;

	test("passes arguments verbatim: no shell, so no injection", async () => {
		const hostile = "$(touch /tmp/pwned); `id` && rm -rf ~ | cat > /dev/null";
		const { stdout } = await run(node, [
			"-e",
			"console.log(process.argv[1])",
			hostile,
		]);
		expect(stdout.trim()).toBe(hostile);
	});

	test("streams stdout lines", async () => {
		const lines: string[] = [];
		await run(node, ["-e", "console.log('a'); console.log('b')"], {
			onLine: (line) => lines.push(line),
		});
		expect(lines).toEqual(["a", "b"]);
	});

	test("non-zero exit rejects with the stderr tail", async () => {
		const error = await run(node, [
			"-e",
			"console.error('ERROR: boom'); process.exit(3)",
		]).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(ExecError);
		expect(error).toMatchObject({ exitCode: 3, timedOut: false });
		expect((error as ExecError).stderr).toContain("ERROR: boom");
	});

	test("kills the process on timeout", async () => {
		const started = Date.now();
		const error = await run(node, ["-e", "setTimeout(() => {}, 60_000)"], {
			timeoutMs: 200,
		}).catch((e: unknown) => e);
		expect(error).toMatchObject({ timedOut: true });
		expect(Date.now() - started).toBeLessThan(5_000);
	});

	test("kills the process when the signal aborts", async () => {
		const controller = new AbortController();
		const pending = run(node, ["-e", "setTimeout(() => {}, 60_000)"], {
			signal: controller.signal,
		});
		controller.abort();
		await expect(pending).rejects.toMatchObject({ name: "AbortError" });
	});

	test("cancelling kills grandchildren too (a downloader → ffmpeg)", async () => {
		const controller = new AbortController();
		let grandchildPid = 0;
		const parent = `
			const { spawn } = require("node:child_process");
			const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" });
			console.log(child.pid);
			setTimeout(() => {}, 60000);
		`;
		const pending = run(node, ["-e", parent], {
			signal: controller.signal,
			onLine: (line) => {
				grandchildPid = Number(line);
				controller.abort();
			},
		});
		await expect(pending).rejects.toMatchObject({ name: "AbortError" });

		const isAlive = (pid: number) => {
			try {
				process.kill(pid, 0);
				return true;
			} catch {
				return false;
			}
		};
		await expect
			.poll(() => isAlive(grandchildPid), { timeout: 3_000 })
			.toBe(false);
	});

	test("a tool gets the extra variables it was given, and nothing else of ours", async () => {
		process.env.TAGTAPE_TEST_SECRET = "secret";
		try {
			const { stdout } = await run(
				node,
				[
					"-e",
					"console.log(process.env.EXTRA, process.env.TAGTAPE_TEST_SECRET)",
				],
				{ env: { EXTRA: "yes" } },
			);
			expect(stdout.trim()).toBe("yes undefined");
		} finally {
			delete process.env.TAGTAPE_TEST_SECRET;
		}
	});

	test("missing binary is an ExecError without exit code", async () => {
		await expect(
			run("definitely-not-a-binary-tagtape", []),
		).rejects.toMatchObject({
			exitCode: null,
		});
	});
});
