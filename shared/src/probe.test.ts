import { expect, test } from "vitest";
import { describeLimit, formatDuration, probeProblem } from "./probe.ts";

test.each([
	[59, "0:59"],
	[754, "12:34"],
	[3725, "1:02:05"],
])("formatDuration(%i) = %s", (seconds, expected) => {
	expect(formatDuration(seconds)).toBe(expected);
});

test.each([
	[7200, "2 hours"],
	[3600, "1 hour"],
	[600, "10 minutes"],
	[60, "1 minute"],
])("describeLimit(%i) = %s", (seconds, expected) => {
	expect(describeLimit(seconds)).toBe(expected);
});

test("probeProblem explains why a track can't be used", () => {
	expect(probeProblem({ durationSeconds: 200, isLive: false })).toBeUndefined();
	expect(probeProblem({ durationSeconds: 200, isLive: true })).toBe(
		"Live streams and premieres can't be converted",
	);
	expect(probeProblem({ durationSeconds: null, isLive: false })).toBe(
		"Couldn't determine the track's length",
	);
	expect(probeProblem({ durationSeconds: 7384, isLive: false })).toBe(
		"Longer than 2 hours (2:03:04)",
	);
});
