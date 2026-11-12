import { MAX_TRACKS } from "@tagtape/shared";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { AlbumForm } from "#/components/album-form";
import { JobProgress } from "#/components/job-progress";
import { RecentAlbums } from "#/components/recent-albums";
import {
	type AlbumDraft,
	emptyDraft,
	type FieldErrors,
} from "#/lib/album-draft";
import { fetchAlbums } from "#/lib/jobs.functions";

export const Route = createFileRoute("/new")({
	head: () => ({ meta: [{ title: "Make an album · TagTape" }] }),
	loader: () => fetchAlbums(),
	component: NewAlbum,
});

type Phase =
	| { kind: "edit"; errors?: FieldErrors }
	| { kind: "job"; jobId: string };

function NewAlbum() {
	// The draft lives here so going back from a failed job keeps everything filled in.
	const [draft, setDraft] = useState<AlbumDraft>(emptyDraft);
	const [phase, setPhase] = useState<Phase>({ kind: "edit" });
	const albums = Route.useLoaderData();
	const router = useRouter();

	return (
		<>
			<section className="mb-10 max-w-2xl">
				<h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
					Links to a tagged MP3 album
				</h1>
				<p className="mt-3 text-muted-foreground">
					Paste up to {MAX_TRACKS} track links, add the album details, and
					download a ZIP of MP3s with titles, track numbers and cover art
					already filled in, so they show up properly on any MP3 player.
				</p>
			</section>

			{phase.kind === "edit" ? (
				<AlbumForm
					// Remount with fresh errors whenever we come back from a job.
					key={JSON.stringify(phase.errors ?? {})}
					draft={draft}
					onDraftChange={setDraft}
					initialErrors={phase.errors}
					onStarted={(jobId) => {
						setPhase({ kind: "job", jobId });
						// The new album (and, on a first visit, the new guest) shows up below.
						void router.invalidate();
					}}
				/>
			) : (
				<JobProgress
					jobId={phase.jobId}
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
					onStartOver={() => {
						setDraft(emptyDraft());
						setPhase({ kind: "edit" });
					}}
				/>
			)}

			<RecentAlbums albums={albums} />
		</>
	);
}
