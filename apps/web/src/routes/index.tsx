import { MAX_TRACKS, SUPPORTED_SITE_NAMES } from "@tagtape/shared";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AlbumForm } from "#/components/album-form";
import { JobProgress } from "#/components/job-progress";
import {
	type AlbumDraft,
	emptyDraft,
	type FieldErrors,
} from "#/lib/album-draft";

export const Route = createFileRoute("/")({ component: Home });

type Phase =
	| { kind: "edit"; errors?: FieldErrors }
	| { kind: "job"; jobId: string };

function Home() {
	// The draft lives here so going back from a failed job keeps everything filled in.
	const [draft, setDraft] = useState<AlbumDraft>(emptyDraft);
	const [phase, setPhase] = useState<Phase>({ kind: "edit" });

	return (
		<>
			<section className="mb-10 max-w-2xl">
				<h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
					Links to a tagged MP3 album
				</h1>
				<p className="mt-3 text-zinc-600 dark:text-zinc-400">
					Paste up to {MAX_TRACKS} links from {SUPPORTED_SITE_NAMES}, add the
					album details, and download a ZIP of MP3s with titles, track numbers
					and cover art already filled in, so they show up properly on any MP3
					player.
				</p>
			</section>

			{phase.kind === "edit" ? (
				<AlbumForm
					// Remount with fresh errors whenever we come back from a job.
					key={JSON.stringify(phase.errors ?? {})}
					draft={draft}
					onDraftChange={setDraft}
					initialErrors={phase.errors}
					onStarted={(jobId) => setPhase({ kind: "job", jobId })}
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
		</>
	);
}
