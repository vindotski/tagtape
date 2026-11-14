import { useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AlbumForm } from "#/components/album-form";
import { JobProgress } from "#/components/job-progress";
import {
	type AlbumDraft,
	emptyDraft,
	type FieldErrors,
} from "#/lib/album-draft";
import {
	dismissJob,
	followJob,
	isWorking,
	useCurrentJob,
} from "#/lib/current-job";
import { onNewAlbum } from "#/lib/new-album";

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
	// Goes up with each fresh start, so the form forgets its own state too.
	const [generation, setGeneration] = useState(0);
	// The album is on its way to the app (between Make album and the job's
	// id coming back). A ref: the menu must see it at once, not a render later.
	const starting = useRef(false);

	// Whether this editor is still on screen (an answer may come back after
	// the user has moved on to another one).
	const mounted = useRef(true);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	// File > New Album: an empty editor, unless an album is being made or
	// started. That one stays on screen: this is where it is followed and
	// cancelled.
	useEffect(() => {
		if (!home) return;
		return onNewAlbum(() => {
			if (starting.current || isWorking(current)) return;
			dismissJob();
			setDraft(emptyDraft());
			setAlbumId(undefined);
			setErrors(undefined);
			setGeneration((count) => count + 1);
		});
	}, [home, current]);

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
			key={`${generation}:${JSON.stringify(errors ?? {})}`}
			draft={draft}
			onDraftChange={setDraft}
			initialErrors={errors}
			albumId={albumId}
			onSubmittingChange={(submitting) => {
				starting.current = submitting;
			}}
			onStarted={(jobId, savedId) => {
				if (savedId) setAlbumId(savedId);
				followJob(jobId, draft, savedId ?? albumId);
				// The album shows up in the lists.
				void router.invalidate();
				// To the screen that shows it, unless the user has since opened
				// another editor: that one keeps its place and its draft.
				if (!home && mounted.current) void navigate({ to: "/" });
			}}
		/>
	);
}
