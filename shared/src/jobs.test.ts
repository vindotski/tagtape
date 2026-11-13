import { describe, expect, test } from "vitest";
import { jobProgress, type TrackStatus } from "./jobs.ts";

const tracks = (...statuses: TrackStatus[]) =>
	statuses.map((status, index) => ({
		number: index + 1,
		title: `Track ${index + 1}`,
		status,
	}));

describe("jobProgress", () => {
	test("nothing until tracks are being saved", () => {
		expect(jobProgress({ status: "queued", tracks: tracks("queued") })).toBe(0);
		expect(jobProgress({ status: "probing", tracks: tracks("queued") })).toBe(
			0,
		);
	});

	test("saved tracks fill up to 95", () => {
		expect(
			jobProgress({
				status: "streaming",
				tracks: tracks("done", "converting", "queued", "queued"),
			}),
		).toBe(24);
		expect(
			jobProgress({ status: "streaming", tracks: tracks("done", "done") }),
		).toBe(95);
	});

	test("only a finished album is 100; a failed one is 0", () => {
		expect(jobProgress({ status: "done", tracks: tracks("done") })).toBe(100);
		expect(jobProgress({ status: "failed", tracks: tracks("done") })).toBe(0);
	});
});
