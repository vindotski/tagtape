import { isJobFinished, type JobSnapshot } from "@tagtape/shared";
import { useEffect, useState } from "react";
import { fetchJob } from "./bridge";

export type JobState =
	| { kind: "loading" }
	| { kind: "ready"; job: JobSnapshot }
	/** The app forgot the job (it was restarted, or the job finished long ago). */
	| { kind: "missing" };

const POLL_MS = 500;

/** Follows a job until it's done or failed. */
export function useJob(jobId: string): JobState {
	const [state, setState] = useState<JobState>({ kind: "loading" });

	useEffect(() => {
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;

		async function poll() {
			const job = await fetchJob(jobId).catch(() => null);
			if (cancelled) return;
			if (!job) {
				setState({ kind: "missing" });
				return;
			}
			setState({ kind: "ready", job });
			if (!isJobFinished(job.status)) timer = setTimeout(poll, POLL_MS);
		}

		void poll();
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [jobId]);

	return state;
}
