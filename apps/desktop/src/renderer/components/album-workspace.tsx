import { isJobFinished } from "@tagtape/shared";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlbumForm } from "#/components/album-form";
import { JobProgress } from "#/components/job-progress";
import {
	type AlbumDraft,
	emptyDraft,
	type FieldErrors,
} from "#/lib/album-draft";
import { fetchJob } from "#/lib/bridge";
import { onNewAlbum } from "#/lib/new-album";

type Phase =
	| { kind: "edit"; errors?: FieldErrors }
	| { kind: "job"; jobId: string };

interface AlbumWorkspaceProps {
	initialDraft: AlbumDraft;
	/** A stored album: converting it again updates it. */
	albumId?: string;
	/** What "Make another album" does; by default the editor starts empty. */
	onStartOver?: () => void;
}

/** The album editor and, once started, the conversion, in one place. */
export function AlbumWorkspace({
	initialDraft,
	albumId: storedId,
	onStartOver,
}: AlbumWorkspaceProps) {
	// The draft lives here so going back from a failed job keeps everything filled in.
	const [draft, setDraft] = useState<AlbumDraft>(initialDraft);
	const [phase, setPhase] = useState<Phase>({ kind: "edit" });
	// Once an album is saved, converting it again updates it instead of adding another.
	const [albumId, setAlbumId] = useState(storedId);
	// Goes up with each fresh start, so the form forgets its own state too.
	const [generation, setGeneration] = useState(0);
	const router = useRouter();

	// File > New Album while this is the new-album screen: an empty editor,
	// unless an album is being made. That one stays on screen, since this is
	// the only place to follow or cancel it.
	useEffect(
		() =>
			onNewAlbum(() => {
				const fresh = () => {
					setDraft(emptyDraft());
					setAlbumId(undefined);
					setPhase({ kind: "edit" });
					setGeneration((count) => count + 1);
				};
				if (phase.kind === "edit") return fresh();
				void fetchJob(phase.jobId)
					.catch(() => null)
					.then((job) => {
						if (!job || isJobFinished(job.status)) fresh();
					});
			}),
		[phase],
	);

	if (phase.kind === "edit") {
		return (
			<AlbumForm
				// Remount with fresh errors whenever we come back from a job.
				key={`${generation}:${JSON.stringify(phase.errors ?? {})}`}
				draft={draft}
				onDraftChange={setDraft}
				initialErrors={phase.errors}
				albumId={albumId}
				onStarted={(jobId, savedId) => {
					setPhase({ kind: "job", jobId });
					if (savedId) setAlbumId(savedId);
					// The album shows up in the lists.
					void router.invalidate();
				}}
			/>
		);
	}
	return (
		<JobProgress
			jobId={phase.jobId}
			album={draft}
			onEdit={(trackErrors) =>
				setPhase({
					kind: "edit",
					errors: Object.fromEntries(
						Object.entries(trackErrors).map(([index, message]) => [
							`tracks.${index}.url`,
							message,
						]),
					),
				})
			}
			onStartOver={
				onStartOver ??
				(() => {
					setDraft(emptyDraft());
					setAlbumId(undefined);
					setPhase({ kind: "edit" });
				})
			}
		/>
	);
}
