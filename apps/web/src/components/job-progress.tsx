import type { JobStatus, TrackSnapshot, TrackStatus } from "@tagtape/shared";
import { Check, CircleAlert, Download } from "lucide-react";
import { useEffect, useRef } from "react";
import { AlbumCover } from "#/components/album/album-cover";
import {
	AlbumFooter,
	AlbumHeader,
	AlbumShell,
	albumFileName,
	albumMeta,
} from "#/components/album/album-shell";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button, LinkButton } from "#/components/ui/button";
import { Progress } from "#/components/ui/progress";
import { Spinner } from "#/components/ui/spinner";
import type { AlbumDraft } from "#/lib/album-draft";
import { type JobView, useJob } from "#/lib/use-job";
import { cn } from "#/lib/utils";

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
	/** The job only knows its tracks; the header shows the album as it was sent. */
	album: AlbumDraft;
	/** Go back to the form with the same album, plus any per-track errors. */
	onEdit: (trackErrors: Record<number, string>) => void;
	onStartOver: () => void;
}

export function JobProgress({
	jobId,
	album,
	onEdit,
	onStartOver,
}: JobProgressProps) {
	const state = useJob(jobId);

	if (state.kind === "loading") {
		return <Panel album={album} title="Starting…" />;
	}
	if (state.kind === "missing" || state.kind === "unreachable") {
		return (
			<Panel
				album={album}
				title={
					state.kind === "missing" ? "This job has expired" : "Lost connection"
				}
				message={
					state.kind === "missing"
						? "Albums can be downloaded for 30 minutes after they're checked. Your form is still filled in, so you can convert it again."
						: "We can't reach TagTape right now. Check your connection and try again."
				}
			>
				<AlbumFooter>
					<Actions onEdit={() => onEdit({})} onStartOver={onStartOver} />
				</AlbumFooter>
			</Panel>
		);
	}

	const { job, downloadUrl } = state.view;
	const streamFailed = job.status === "failed" && job.downloadReady;
	const message =
		job.status === "streaming" || job.status === "queued"
			? KEEP_OPEN
			: undefined;
	return (
		<Panel
			album={album}
			title={JOB_LABELS[job.status]}
			message={message}
			tone={job.status}
			error={job.error}
			progress={<ProgressBar view={state.view} />}
		>
			<ol aria-label="Tracks" className="border-t">
				{job.tracks.map((track) => (
					<TrackLine key={track.number} track={track} />
				))}
			</ol>
			{/* The download *is* the conversion: start it as soon as the check passes. */}
			{job.status === "ready" && downloadUrl && (
				<AutoDownload url={downloadUrl} />
			)}
			{job.status === "ready" && downloadUrl && (
				<AlbumFooter>
					<p className="text-sm text-muted-foreground">
						Download didn't start?{" "}
						<DownloadLink
							url={downloadUrl}
							variant="link"
							className="h-auto p-0 align-baseline"
						>
							Start it here
						</DownloadLink>
					</p>
				</AlbumFooter>
			)}
			{job.status === "failed" && !streamFailed && (
				<AlbumFooter>
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
				</AlbumFooter>
			)}
			{(job.status === "done" || streamFailed) && (
				<AlbumFooter>
					{job.status === "done" && !downloadUrl && (
						<p className="text-sm text-muted-foreground">
							This album can't be downloaded again. Edit it to convert it once
							more.
						</p>
					)}
					<ActionsRow>
						{job.status === "done" && !downloadUrl && (
							<Button size="lg" onPress={() => onEdit({})}>
								Edit the album
							</Button>
						)}
						{downloadUrl && (
							<DownloadLink url={downloadUrl} size="lg">
								<Download aria-hidden="true" />
								{streamFailed ? "Try the download again" : "Download again"}
							</DownloadLink>
						)}
						<Button
							variant="ghost"
							size="lg"
							onPress={job.status === "done" ? onStartOver : () => onEdit({})}
						>
							{job.status === "done"
								? "Convert another album"
								: "Edit the album"}
						</Button>
					</ActionsRow>
				</AlbumFooter>
			)}
		</Panel>
	);
}

function Panel({
	album,
	title,
	message,
	tone,
	error,
	progress,
	children,
}: {
	album: AlbumDraft;
	title: string;
	message?: string | undefined;
	tone?: JobStatus;
	error?: string | undefined;
	progress?: React.ReactNode;
	children?: React.ReactNode;
}) {
	const trackCount = `${album.tracks.length} ${album.tracks.length === 1 ? "track" : "tracks"}`;
	return (
		<AlbumShell
			role="region"
			aria-labelledby="job-heading"
			fileName={albumFileName(album.artist, album.title)}
		>
			<AlbumHeader cover={<AlbumCover title={album.title} />}>
				<p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
					Album
				</p>
				<p className="truncate font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
					{album.title || "Untitled album"}
				</p>
				<p className="mt-1 truncate text-muted-foreground md:text-lg">
					{album.artist}
				</p>
				<p className="mt-2 text-xs text-muted-foreground">
					{albumMeta([album.genre, album.year, trackCount])}
				</p>
			</AlbumHeader>
			<div className="flex flex-col gap-3 border-t px-4 py-4 sm:px-6">
				{/* Only the status is announced, not every track change. */}
				<div aria-live="polite">
					<h2
						id="job-heading"
						className={cn(
							"font-semibold",
							tone === "failed" && "text-destructive",
							tone === "done" && "text-primary",
						)}
					>
						{title}
					</h2>
					{message && (
						<p className="mt-1 text-sm text-muted-foreground">{message}</p>
					)}
				</div>
				{progress}
				{error && (
					<Alert variant="destructive">
						<CircleAlert aria-hidden="true" />
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
			</div>
			{children}
		</AlbumShell>
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
		<Progress
			aria-label="Overall progress"
			value={percent}
			// A sliver of bar shows that something is happening before the first track is done.
			className="[&_[data-slot=progress-indicator]]:min-w-[4%]"
		/>
	);
}

/** A playlist row; the converting track is highlighted like a playing one. */
function TrackLine({ track }: { track: TrackSnapshot }) {
	const number = String(track.number).padStart(2, "0");
	const converting = track.status === "converting";
	return (
		<li
			className={cn(
				"flex items-start gap-3 border-b px-4 py-2.5 text-sm last:border-b-0",
				converting && "bg-muted/60",
			)}
		>
			<span className="grid h-5 w-6 shrink-0 place-items-center text-xs tabular-nums text-muted-foreground">
				{converting ? (
					<Spinner className="text-primary" aria-hidden="true" />
				) : track.status === "done" ? (
					<Check className="size-4 text-primary" aria-hidden="true" />
				) : track.status === "error" ? (
					<CircleAlert className="size-4 text-destructive" aria-hidden="true" />
				) : (
					number
				)}
			</span>
			<div className="min-w-0 flex-1">
				<p className={cn("truncate", converting && "font-medium text-primary")}>
					{number} - {track.title}.mp3
				</p>
				{track.error && (
					<p className="mt-0.5 text-xs text-destructive">{track.error}</p>
				)}
			</div>
			<span
				className={cn(
					"shrink-0 text-xs text-muted-foreground",
					track.status === "error" && "text-destructive",
				)}
			>
				{TRACK_LABELS[track.status]}
			</span>
		</li>
	);
}

function ActionsRow({ children }: { children: React.ReactNode }) {
	return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

function Actions({
	onEdit,
	onStartOver,
}: {
	onEdit: () => void;
	onStartOver: () => void;
}) {
	return (
		<ActionsRow>
			<Button size="lg" onPress={onEdit}>
				Edit and try again
			</Button>
			<Button variant="ghost" size="lg" onPress={onStartOver}>
				Start over
			</Button>
		</ActionsRow>
	);
}

/**
 * A download link: `download` makes the browser save the response, and show a
 * failed download (instead of navigating away) if the server refuses.
 */
function DownloadLink({
	url,
	...props
}: { url: string } & Omit<
	React.ComponentProps<typeof LinkButton>,
	"href" | "download"
>) {
	return <LinkButton href={url} download {...props} />;
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
