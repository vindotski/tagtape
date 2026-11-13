import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createLog } from "./log.ts";

let dir: string;
let file: string;
beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "tagtape-log-"));
	file = join(dir, "logs", "main.log");
	for (const level of ["info", "warn", "error"] as const) {
		vi.spyOn(console, level).mockImplementation(() => {});
	}
});
afterEach(async () => {
	vi.restoreAllMocks();
	await rm(dir, { recursive: true, force: true });
});

test("writes one line per event, with errors spelled out", async () => {
	const log = createLog(() => file);
	log.info({}, "Started");
	log.error(
		{
			jobId: "j1",
			err: new Error("outer", {
				cause: Object.assign(new Error("disk"), { code: "ENOSPC" }),
			}),
		},
		"Job crashed",
	);
	const lines = (await readFile(file, "utf8")).trimEnd().split("\n");
	expect(lines).toHaveLength(2);
	expect(lines[0]).toMatch(/^\d{4}-\d\d-\d\dT[\d:.]+Z INFO Started$/);
	expect(lines[1]).toContain(" ERROR Job crashed ");
	const details = JSON.parse(
		(lines[1] as string).split("Job crashed ")[1] ?? "",
	);
	expect(details).toMatchObject({
		jobId: "j1",
		err: { message: "outer", cause: { message: "disk", code: "ENOSPC" } },
	});
	expect(details.err.stack).toContain("outer");
});

test("a big log from earlier runs is set aside at the start", async () => {
	createLog(() => file).info({}, "first run");
	await writeFile(file, "x".repeat(1024 * 1024 + 1));
	createLog(() => file).info({}, "next run");
	expect(await readFile(file, "utf8")).toMatch(/INFO next run\n$/);
	expect((await readFile(`${file}.old`, "utf8")).length).toBe(1024 * 1024 + 1);
});

test("never throws, even with nowhere to write", () => {
	const log = createLog(() => join(dir, "\0bad", "main.log"));
	expect(() => log.warn({ a: 1 }, "still fine")).not.toThrow();
	const cyclic: Record<string, unknown> = {};
	cyclic.self = cyclic;
	expect(() => createLog(() => file).info(cyclic, "cyclic")).not.toThrow();
});
