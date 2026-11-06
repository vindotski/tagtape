import { isJobFinished } from "@tagtape/shared";
import { useEffect, useState } from "react";
import { fetchJob } from "./jobs.functions";

export type JobView = NonNullable<Awaited<ReturnType<typeof fetchJob>>["view"]>;

export type JobState =
	| { kind: "loading" }
	| { kind: "ready"; view: JobView }
	| { kind: "missing" }
	| { kind: "unreachable" };

const POLL_MS = 1000;
/** Consecutive failed polls before we tell the user. */
const MAX_FAILURES = 5;

/** Polls the job every second until it's done or failed. */
export function useJob(jobId: string): JobState {
	const [state, setState] = useState<JobState>({ kind: "loading" });

	useEffect(() => {
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let failures = 0;

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
				if (isJobFinished(view.job.status)) return;
			} catch {
				if (cancelled) return;
				failures++;
				if (failures >= MAX_FAILURES) setState({ kind: "unreachable" });
			}
			timer = setTimeout(poll, POLL_MS);
		}

		void poll();
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [jobId]);

	return state;
}
