import type { JobStatus, TrackSnapshot, TrackStatus } from "@tagtape/shared";
import { CircleAlert } from "lucide-react";
import { useEffect, useRef } from "react";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button, LinkButton } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemMedia,
	ItemTitle,
} from "#/components/ui/item";
import { Progress } from "#/components/ui/progress";
import { Spinner } from "#/components/ui/spinner";
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
		job.status === "streaming" || job.status === "queued"
			? KEEP_OPEN
			: undefined;
	return (
		<Panel
			title={JOB_LABELS[job.status]}
			message={message}
			tone={job.status}
			error={job.error}
		>
			<ProgressBar view={state.view} />
			<ItemGroup role="list" className="gap-1">
				{job.tracks.map((track) => (
					<TrackLine key={track.number} track={track} />
				))}
			</ItemGroup>
			{/* The download *is* the conversion: start it as soon as the check passes. */}
			{job.status === "ready" && downloadUrl && (
				<AutoDownload url={downloadUrl} />
			)}
			{job.status === "ready" && downloadUrl && (
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
				<ActionsRow>
					{downloadUrl && (
						<DownloadLink url={downloadUrl} size="lg">
							{streamFailed ? "Try the download again" : "Download again"}
						</DownloadLink>
					)}
					<Button
						variant="ghost"
						size="lg"
						onPress={job.status === "done" ? onStartOver : () => onEdit({})}
					>
						{job.status === "done" ? "Convert another album" : "Edit the album"}
					</Button>
				</ActionsRow>
			)}
		</Panel>
	);
}

function Panel({
	title,
	message,
	tone,
	error,
	children,
}: {
	title: string;
	message?: string | undefined;
	tone?: JobStatus;
	error?: string | undefined;
	children?: React.ReactNode;
}) {
	return (
		<Card
			role="region"
			aria-labelledby="job-heading"
			className="mx-auto w-full max-w-2xl"
		>
			{/* Only the status is announced, not every badge change. */}
			<CardHeader aria-live="polite">
				<CardTitle className="text-base">
					<h2
						id="job-heading"
						className={cn(
							tone === "failed" && "text-destructive",
							tone === "done" && "text-primary",
						)}
					>
						{title}
					</h2>
				</CardTitle>
				{message && <CardDescription>{message}</CardDescription>}
			</CardHeader>
			<CardContent className="flex flex-col gap-4 empty:hidden">
				{error && (
					<Alert variant="destructive">
						<CircleAlert aria-hidden="true" />
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
				{children}
			</CardContent>
		</Card>
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

const BADGE_VARIANTS = {
	queued: "outline",
	converting: "secondary",
	done: "default",
	error: "destructive",
} as const satisfies Record<TrackStatus, string>;

function TrackLine({ track }: { track: TrackSnapshot }) {
	return (
		<Item size="xs" role="listitem" className="items-start">
			<ItemMedia className="w-5 justify-end text-xs tabular-nums text-muted-foreground">
				{track.number}
			</ItemMedia>
			<ItemContent className="min-w-0">
				<ItemTitle className="block truncate">{track.title}</ItemTitle>
				{track.error && (
					<ItemDescription className="text-destructive">
						{track.error}
					</ItemDescription>
				)}
			</ItemContent>
			<ItemActions>
				<Badge variant={BADGE_VARIANTS[track.status]}>
					{track.status === "converting" && <Spinner aria-hidden="true" />}
					{TRACK_LABELS[track.status]}
				</Badge>
			</ItemActions>
		</Item>
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
