import { isJobFinished } from "@tagtape/shared";
import { useEffect, useState } from "react";
import { fetchJob } from "./jobs.functions";

export type JobView = NonNullable<Awaited<ReturnType<typeof fetchJob>>["view"]>;

export type JobState =
	| { kind: "loading" }
	| { kind: "ready"; view: JobView }
	| { kind: "missing" }
	| { kind: "unreachable" };

/** Poll fast while something is happening… */
const ACTIVE_POLL_MS = 1000;
/** …and slowly when idle, so a "Download again" still shows live progress. */
const IDLE_POLL_MS = 3000;
/** Consecutive failed polls before we tell the user. */
const MAX_FAILURES = 5;

/** Polls the job while the page is open, until it expires. */
export function useJob(jobId: string): JobState {
	const [state, setState] = useState<JobState>({ kind: "loading" });

	useEffect(() => {
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let failures = 0;
		let delay = ACTIVE_POLL_MS;

		async function poll() {
			try {
				const { view } = await fetchJob({ data: { id: jobId } });
				if (cancelled) return;
				failures = 0;
				if (!view) {
					setState({ kind: "missing" });
					return;
				}
				setState({ kind: "ready", view });
				delay = isJobFinished(view.job.status) ? IDLE_POLL_MS : ACTIVE_POLL_MS;
			} catch {
				if (cancelled) return;
				failures++;
				if (failures >= MAX_FAILURES) setState({ kind: "unreachable" });
			}
			timer = setTimeout(poll, delay);
		}

		void poll();
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [jobId]);

	return state;
}
