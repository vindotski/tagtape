import { MAX_TRACK_SECONDS } from "./limits.ts";

/** What a source's check found out about a track. */
export interface ProbeFacts {
	durationSeconds: number | null;
	isLive: boolean;
}

/** Why a checked track can't be converted, or `undefined` when it can. */
export function probeProblem(probe: ProbeFacts): string | undefined {
	if (probe.isLive) return "Live streams and premieres can't be converted";
	if (probe.durationSeconds === null)
		return "Couldn't determine the track's length";
	if (probe.durationSeconds > MAX_TRACK_SECONDS) {
		return `Longer than ${describeLimit(MAX_TRACK_SECONDS)} (${formatDuration(probe.durationSeconds)})`;
	}
	return undefined;
}

/** 7200 → "2 hours", 600 → "10 minutes". */
export function describeLimit(seconds: number): string {
	if (seconds % 3600 === 0) {
		const hours = seconds / 3600;
		return `${hours} hour${hours === 1 ? "" : "s"}`;
	}
	const minutes = Math.round(seconds / 60);
	return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export function formatDuration(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = String(seconds % 60).padStart(2, "0");
	return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
