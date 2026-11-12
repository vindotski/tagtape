import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { AlbumForm } from "#/components/album-form";
import { JobProgress } from "#/components/job-progress";
import {
	type AlbumDraft,
	emptyDraft,
	type FieldErrors,
} from "#/lib/album-draft";

type Phase =
	| { kind: "edit"; errors?: FieldErrors }
	| { kind: "job"; jobId: string };

interface AlbumWorkspaceProps {
	initialDraft: AlbumDraft;
	/** A stored album: converting it again updates it. */
	albumId?: string;
	/** What "Convert another album" does; by default the editor starts empty. */
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
	const router = useRouter();

	if (phase.kind === "edit") {
		return (
			<AlbumForm
				// Remount with fresh errors whenever we come back from a job.
				key={JSON.stringify(phase.errors ?? {})}
				draft={draft}
				onDraftChange={setDraft}
				initialErrors={phase.errors}
				albumId={albumId}
				onStarted={(jobId, savedId) => {
					setPhase({ kind: "job", jobId });
					if (savedId) setAlbumId(savedId);
					// The album (and, on a first visit, the new guest) shows up in the lists.
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
