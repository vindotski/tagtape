import { describe, expect, test } from "vitest";
import { ExecError, run } from "./exec.ts";
import {
	archiveFileName,
	contentDisposition,
	safeFileName,
	trackFileName,
} from "./filenames.ts";
import { isPrivateAddress } from "./net.ts";

describe("filenames", () => {
	test.each([
		["keeps unicode", "Ниночка — 夜に駆ける 🎵", "Ниночка — 夜に駆ける 🎵"],
		[
			"strips illegal characters",
			'AC/DC: "Back" in <Black>?',
			"AC DC Back in Black",
		],
		["strips control characters", "a\u0000b\u001fc", "a b c"],
		["no leading dot or trailing dot", "..hidden.", "hidden"],
		["collapses whitespace", "  lots   of\tspace ", "lots of space"],
		["falls back when empty", '/:*?"', "Fallback"],
	])("%s", (_label, input, expected) => {
		expect(safeFileName(input, "Fallback")).toBe(expected);
	});

	test("caps length without splitting characters", () => {
		expect(Array.from(safeFileName("🎵".repeat(500), "x"))).toHaveLength(120);
	});

	test("zero-pads track numbers to sort correctly", () => {
		expect(trackFileName(3, 9, "Song")).toBe("03 - Song.mp3");
		expect(trackFileName(7, 10, "Song")).toBe("07 - Song.mp3");
		expect(trackFileName(1, 1, "")).toBe("01 - Track 1.mp3");
	});

	test("archive name", () => {
		expect(archiveFileName("Rick Astley", "Whenever You Need Somebody")).toBe(
			"Rick Astley - Whenever You Need Somebody.zip",
		);
	});

	test("content-disposition has an ASCII fallback and an RFC 5987 name", () => {
		expect(contentDisposition("Björk - Homogenic.zip")).toBe(
			`attachment; filename="Bjork - Homogenic.zip"; filename*=UTF-8''Bj%C3%B6rk%20-%20Homogenic.zip`,
		);
		expect(contentDisposition('夜 "x".zip')).toBe(
			`attachment; filename="x.zip"; filename*=UTF-8''%E5%A4%9C%20%22x%22.zip`,
		);
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
		"not an ip",
	])("blocks %s", (address) => {
		expect(isPrivateAddress(address)).toBe(true);
	});

	test.each([
		"8.8.8.8",
		"142.250.74.14",
		"172.32.0.1",
		"2a00:1450:4001:80b::200e",
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

	test("missing binary is an ExecError without exit code", async () => {
		await expect(
			run("definitely-not-a-binary-tagtape", []),
		).rejects.toMatchObject({
			exitCode: null,
		});
	});
});
