import type { JobStatus, TrackSnapshot, TrackStatus } from "@tagtape/shared";
import { useEffect, useRef } from "react";
import { type JobView, useJob } from "#/lib/use-job";

const JOB_LABELS: Record<JobStatus, string> = {
	queued: "Waiting for a free slot…",
	probing: "Checking your tracks…",
	ready: "Starting your download…",
	streaming: "Converting and downloading…",
	done: "Your album has downloaded",
	failed: "That didn't work",
};

const TRACK_LABELS: Record<TrackStatus, string> = {
	queued: "Waiting",
	converting: "Converting",
	done: "Done",
	error: "Problem",
};

/** Shown while the download runs: closing the tab stops the conversion. */
const KEEP_OPEN =
	"Tracks are converted while your browser downloads the ZIP. Keep this tab open until it finishes; nothing is stored on our side.";

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
						? "Albums can be downloaded for 30 minutes after they're checked. Your form is still filled in, so you can convert it again."
						: "We can't reach TagTape right now. Check your connection and try again."
				}
			>
				<Actions onEdit={() => onEdit({})} onStartOver={onStartOver} />
			</Panel>
		);
	}

	const { job, downloadUrl } = state.view;
	const streamFailed = job.status === "failed" && job.downloadReady;
	const message =
		job.error ??
		(job.status === "streaming" || job.status === "queued"
			? KEEP_OPEN
			: undefined);
	return (
		<Panel title={JOB_LABELS[job.status]} message={message} tone={job.status}>
			<ProgressBar view={state.view} />
			<ol className="mt-5 divide-y divide-zinc-100 dark:divide-zinc-800">
				{job.tracks.map((track) => (
					<TrackLine key={track.number} track={track} />
				))}
			</ol>
			{/* The download *is* the conversion: start it as soon as the check passes. */}
			{job.status === "ready" && downloadUrl && (
				<AutoDownload url={downloadUrl} />
			)}
			{job.status === "ready" && downloadUrl && (
				<p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
					Download didn't start?{" "}
					<DownloadLink
						url={downloadUrl}
						className="font-medium text-emerald-700 underline underline-offset-4 dark:text-emerald-400"
					>
						Start it here
					</DownloadLink>
				</p>
			)}
			{job.status === "failed" && !streamFailed && (
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
			{(job.status === "done" || streamFailed) && (
				<div className="mt-6 flex flex-wrap items-center gap-3">
					{downloadUrl && (
						<DownloadLink
							url={downloadUrl}
							className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
						>
							{streamFailed ? "Try the download again" : "Download again"}
						</DownloadLink>
					)}
					<button
						type="button"
						onClick={job.status === "done" ? onStartOver : () => onEdit({})}
						className="rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
					>
						{job.status === "done" ? "Convert another album" : "Edit the album"}
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
		status === "done"
			? 100
			: status === "streaming"
				? Math.round((done / tracks.length) * 95)
				: 0;
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
	const busy = track.status === "converting";
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

/**
 * A download link: `download` makes the browser save the response, and show a
 * failed download (instead of navigating away) if the server refuses.
 */
function DownloadLink({
	url,
	className,
	children,
}: {
	url: string;
	className: string;
	children: React.ReactNode;
}) {
	return (
		<a href={url} download className={className}>
			{children}
		</a>
	);
}

/** Starts the download once, as soon as the album is ready. */
function AutoDownload({ url }: { url: string }) {
	const started = useRef(false);
	useEffect(() => {
		if (started.current) return;
		started.current = true;
		const link = document.createElement("a");
		link.href = url;
		link.download = "";
		document.body.append(link);
		link.click();
		link.remove();
	}, [url]);
	return null;
}
