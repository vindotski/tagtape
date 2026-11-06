import type { JobStatus, TrackSnapshot, TrackStatus } from "@tagtape/shared";
import { useEffect, useRef } from "react";
import { type JobView, useJob } from "#/lib/use-job";

const JOB_LABELS: Record<JobStatus, string> = {
	queued: "Waiting for a free slot…",
	probing: "Checking your tracks…",
	processing: "Converting your tracks…",
	packaging: "Creating the ZIP…",
	done: "Your album is ready",
	failed: "That didn't work",
};

const TRACK_LABELS: Record<TrackStatus, string> = {
	queued: "Waiting",
	downloading: "Downloading",
	converting: "Converting to MP3",
	tagging: "Writing tags",
	done: "Done",
	error: "Problem",
};

interface JobProgressProps {
	jobId: string;
	/** Go back to the form with the same album, plus any per-track errors. */
	onEdit: (trackErrors: Record<number, string>) => void;
	onStartOver: () => void;
}

export function JobProgress({ jobId, onEdit, onStartOver }: JobProgressProps) {
	const state = useJob(jobId);

	if (state.kind === "loading") {
		return <Panel title="Starting…" />;
	}
	if (state.kind === "missing" || state.kind === "unreachable") {
		return (
			<Panel
				title={
					state.kind === "missing" ? "This job has expired" : "Lost connection"
				}
				message={
					state.kind === "missing"
						? "Finished albums are kept for 30 minutes. Your form is still filled in, so you can convert it again."
						: "We can't reach TagTape right now. Check your connection and try again."
				}
			>
				<Actions onEdit={() => onEdit({})} onStartOver={onStartOver} />
			</Panel>
		);
	}

	const { job, downloadUrl } = state.view;
	return (
		<Panel title={JOB_LABELS[job.status]} message={job.error} tone={job.status}>
			<ProgressBar view={state.view} />
			<ol className="mt-5 divide-y divide-zinc-100 dark:divide-zinc-800">
				{job.tracks.map((track) => (
					<TrackLine key={track.number} track={track} />
				))}
			</ol>
			{job.status === "done" && downloadUrl && (
				<AutoDownload url={downloadUrl} />
			)}
			{job.status === "failed" && (
				<Actions
					onEdit={() =>
						onEdit(
							Object.fromEntries(
								job.tracks
									.filter((track) => track.error)
									.map((track) => [track.number - 1, track.error as string]),
							),
						)
					}
					onStartOver={onStartOver}
				/>
			)}
			{job.status === "done" && (
				<div className="mt-6 flex flex-wrap items-center gap-3">
					{downloadUrl && (
						<a
							href={downloadUrl}
							className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
						>
							Download ZIP
						</a>
					)}
					<button
						type="button"
						onClick={onStartOver}
						className="rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
					>
						Convert another album
					</button>
				</div>
			)}
		</Panel>
	);
}

function Panel({
	title,
	message,
	tone,
	children,
}: {
	title: string;
	message?: string | undefined;
	tone?: JobStatus;
	children?: React.ReactNode;
}) {
	return (
		<section
			aria-live="polite"
			className="mx-auto max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
		>
			<h2
				className={`text-lg font-semibold ${
					tone === "failed"
						? "text-red-700 dark:text-red-400"
						: tone === "done"
							? "text-emerald-700 dark:text-emerald-400"
							: "text-zinc-900 dark:text-zinc-100"
				}`}
			>
				{title}
			</h2>
			{message && (
				<p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
					{message}
				</p>
			)}
			{children}
		</section>
	);
}

function ProgressBar({ view }: { view: JobView }) {
	const { tracks, status } = view.job;
	if (status === "failed") return null;
	const done = tracks.filter((track) => track.status === "done").length;
	const percent =
		status === "done" ? 100 : Math.round((done / tracks.length) * 95);
	return (
		<div
			role="progressbar"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={percent}
			aria-label="Overall progress"
			className="mt-4 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
		>
			<div
				className="h-full rounded-full bg-emerald-500 transition-[width] duration-500"
				style={{ width: `${Math.max(percent, 4)}%` }}
			/>
		</div>
	);
}

function TrackLine({ track }: { track: TrackSnapshot }) {
	const busy =
		track.status === "downloading" ||
		track.status === "converting" ||
		track.status === "tagging";
	return (
		<li className="flex items-start gap-3 py-2.5 text-sm">
			<span className="w-5 shrink-0 text-right tabular-nums text-zinc-400">
				{track.number}
			</span>
			<div className="min-w-0 flex-1">
				<p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
					{track.title}
				</p>
				{track.error && (
					<p className="text-xs text-red-600 dark:text-red-400">
						{track.error}
					</p>
				)}
			</div>
			<span
				className={`flex shrink-0 items-center gap-1.5 text-xs ${
					track.status === "done"
						? "text-emerald-700 dark:text-emerald-400"
						: track.status === "error"
							? "text-red-600 dark:text-red-400"
							: "text-zinc-500"
				}`}
			>
				{busy && (
					<span
						className="size-2 animate-pulse rounded-full bg-emerald-500"
						aria-hidden="true"
					/>
				)}
				{TRACK_LABELS[track.status]}
			</span>
		</li>
	);
}

function Actions({
	onEdit,
	onStartOver,
}: {
	onEdit: () => void;
	onStartOver: () => void;
}) {
	return (
		<div className="mt-6 flex flex-wrap gap-3">
			<button
				type="button"
				onClick={onEdit}
				className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
			>
				Edit and try again
			</button>
			<button
				type="button"
				onClick={onStartOver}
				className="rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
			>
				Start over
			</button>
		</div>
	);
}

/** Starts the download once when the job finishes; the button stays for re-downloads. */
function AutoDownload({ url }: { url: string }) {
	const started = useRef(false);
	useEffect(() => {
		if (started.current) return;
		started.current = true;
		window.location.assign(url);
	}, [url]);
	return null;
}
