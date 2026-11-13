import { isJobFinished, type JobSnapshot } from "@tagtape/shared";
import { useSyncExternalStore } from "react";
import type { AlbumDraft } from "./album-draft";
import { fetchJob } from "./bridge";

export type JobState =
	| { kind: "loading" }
	| { kind: "ready"; job: JobSnapshot }
	/** The app no longer knows the job. */
	| { kind: "missing" };

/**
 * The album being made, or the last one made, until the user moves on from
 * it. One at a time (the app refuses a second), and it lives outside any
 * screen: leaving the progress view must never lose the way back to it.
 */
export interface CurrentJob {
	jobId: string;
	/** The album as it was sent, for the progress view and for editing again. */
	draft: AlbumDraft;
	/** The library album this run belongs to, once stored. */
	albumId: string | undefined;
	state: JobState;
}

const POLL_MS = 500;

let current: CurrentJob | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function set(next: CurrentJob | null): void {
	current = next;
	for (const listener of listeners) listener();
}

async function poll(jobId: string): Promise<void> {
	const job = await fetchJob(jobId).catch(() => null);
	// Moved on to another job, or dismissed, while this was in flight.
	if (current?.jobId !== jobId) return;
	if (!job) {
		set({ ...current, state: { kind: "missing" } });
		return;
	}
	set({ ...current, state: { kind: "ready", job } });
	if (!isJobFinished(job.status)) {
		timer = setTimeout(() => void poll(jobId), POLL_MS);
	}
}

/** Starts following a job that was just created. */
export function followJob(
	jobId: string,
	draft: AlbumDraft,
	albumId: string | undefined,
): void {
	clearTimeout(timer);
	set({ jobId, draft, albumId, state: { kind: "loading" } });
	void poll(jobId);
}

/** The user is done with it (editing again, or starting another album). */
export function dismissJob(): void {
	clearTimeout(timer);
	set(null);
}

export function useCurrentJob(): CurrentJob | null {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		() => current,
	);
}

/** Whether a job is still being checked or saved. */
export function isWorking(job: CurrentJob | null): boolean {
	if (!job) return false;
	return (
		job.state.kind === "loading" ||
		(job.state.kind === "ready" && !isJobFinished(job.state.job.status))
	);
}
