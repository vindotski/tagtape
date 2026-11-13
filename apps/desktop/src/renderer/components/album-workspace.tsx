import { useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { AlbumForm } from "#/components/album-form";
import { JobProgress } from "#/components/job-progress";
import {
	type AlbumDraft,
	emptyDraft,
	type FieldErrors,
} from "#/lib/album-draft";
import { dismissJob, followJob, useCurrentJob } from "#/lib/current-job";

interface AlbumWorkspaceProps {
	initialDraft: AlbumDraft;
	/** A stored album: converting it again updates it. */
	albumId?: string;
	/**
	 * The "New album" screen: it shows the album being made instead of an
	 * empty form, so its progress is always one click away. Other editors
	 * (a stored album, a shared one) keep their form and send the user there
	 * once their album starts.
	 */
	home?: boolean;
}

/** The album editor and, on the home screen, the album being made. */
export function AlbumWorkspace({
	initialDraft,
	albumId: storedId,
	home = false,
}: AlbumWorkspaceProps) {
	const [draft, setDraft] = useState<AlbumDraft>(initialDraft);
	const [errors, setErrors] = useState<FieldErrors>();
	// Once an album is saved, converting it again updates it instead of adding another.
	const [albumId, setAlbumId] = useState(storedId);
	const current = useCurrentJob();
	const router = useRouter();
	const navigate = useNavigate();

	if (home && current) {
		return (
			<JobProgress
				state={current.state}
				album={current.draft}
				// Back to the form with everything still filled in.
				onEdit={(trackErrors) => {
					setDraft(current.draft);
					setAlbumId(current.albumId);
					setErrors(
						Object.fromEntries(
							Object.entries(trackErrors).map(([index, message]) => [
								`tracks.${index}.url`,
								message,
							]),
						),
					);
					dismissJob();
				}}
				onStartOver={() => {
					setDraft(emptyDraft());
					setAlbumId(undefined);
					setErrors(undefined);
					dismissJob();
				}}
			/>
		);
	}
	return (
		<AlbumForm
			// Remount with fresh errors whenever we come back from a job.
			key={JSON.stringify(errors ?? {})}
			draft={draft}
			onDraftChange={setDraft}
			initialErrors={errors}
			albumId={albumId}
			onStarted={(jobId, savedId) => {
				if (savedId) setAlbumId(savedId);
				followJob(jobId, draft, savedId ?? albumId);
				// The album shows up in the lists.
				void router.invalidate();
				if (!home) void navigate({ to: "/" });
			}}
		/>
	);
}
