import { useState } from "react";
import {
	type AlbumDraft,
	type FieldErrors,
	moveTrack,
	newTrack,
	type TrackDraft,
	validateDraft,
} from "#/lib/album-draft";
import { startJob } from "#/lib/jobs.functions";
import { TextField } from "./text-field";
import { TrackList } from "./track-list";

interface AlbumFormProps {
	draft: AlbumDraft;
	onDraftChange: (draft: AlbumDraft) => void;
	/** Errors from a previous attempt, e.g. per-track problems the API found. */
	initialErrors?: FieldErrors;
	onStarted: (jobId: string) => void;
}

export function AlbumForm({
	draft,
	onDraftChange,
	initialErrors,
	onStarted,
}: AlbumFormProps) {
	const [errors, setErrors] = useState<FieldErrors>(initialErrors ?? {});
	const [formError, setFormError] = useState<string>();
	const [submitting, setSubmitting] = useState(false);

	const update = (patch: Partial<AlbumDraft>, clear: string[] = []) => {
		onDraftChange({ ...draft, ...patch });
		if (clear.some((key) => key in errors)) {
			setErrors((current) => {
				const next = { ...current };
				for (const key of clear) delete next[key];
				return next;
			});
		}
	};
	// Reordering or removing shifts indexes, so per-track errors no longer line up.
	const updateTracks = (tracks: TrackDraft[]) => {
		onDraftChange({ ...draft, tracks });
		setErrors(
			({ title, artist, genre, year, coverUrl }) =>
				Object.fromEntries(
					Object.entries({ title, artist, genre, year, coverUrl }).filter(
						([, v]) => v,
					),
				) as FieldErrors,
		);
	};

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFormError(undefined);
		const result = validateDraft(draft);
		if (!result.ok) {
			setErrors(result.errors);
			focusFirstError(event.currentTarget);
			return;
		}
		setSubmitting(true);
		try {
			const response = await startJob({ data: result.input });
			if (response.ok) {
				onStarted(response.jobId);
				return;
			}
			setFormError(response.message);
			if (response.fieldErrors) setErrors(response.fieldErrors);
		} catch {
			setFormError("Something went wrong. Please try again.");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<form
			noValidate
			onSubmit={handleSubmit}
			className="grid gap-8 lg:grid-cols-[20rem_1fr]"
		>
			<section aria-labelledby="album-heading" className="space-y-4">
				<h2
					id="album-heading"
					className="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
				>
					Album
				</h2>
				<TextField
					id="title"
					label="Album title"
					value={draft.title}
					onChange={(title) => update({ title }, ["title"])}
					error={errors.title}
					disabled={submitting}
					maxLength={60}
					autoComplete="off"
				/>
				<TextField
					id="artist"
					label="Artist"
					value={draft.artist}
					onChange={(artist) => update({ artist }, ["artist"])}
					error={errors.artist}
					disabled={submitting}
					maxLength={60}
					autoComplete="off"
				/>
				<div className="grid grid-cols-[1fr_6rem] gap-3">
					<TextField
						id="genre"
						label="Genre"
						optional
						value={draft.genre}
						onChange={(genre) => update({ genre }, ["genre"])}
						error={errors.genre}
						disabled={submitting}
						maxLength={30}
					/>
					<TextField
						id="year"
						label="Year"
						optional
						inputMode="numeric"
						placeholder="1987"
						value={draft.year}
						onChange={(year) => update({ year }, ["year"])}
						error={errors.year}
						disabled={submitting}
						maxLength={4}
					/>
				</div>
				<TextField
					id="coverUrl"
					label="Cover image URL"
					optional
					type="url"
					inputMode="url"
					placeholder="https://…"
					value={draft.coverUrl}
					onChange={(coverUrl) => update({ coverUrl }, ["coverUrl"])}
					error={errors.coverUrl}
					disabled={submitting}
				/>
				<p className="text-xs text-zinc-500">
					Covers are cropped to a 1000×1000 square. Up to 5 MB.
				</p>
			</section>

			<div>
				<TrackList
					tracks={draft.tracks}
					errors={errors}
					disabled={submitting}
					onChange={(index, patch) =>
						update(
							{
								tracks: draft.tracks.map((track, i) =>
									i === index ? { ...track, ...patch } : track,
								),
							},
							Object.keys(patch).map((field) => `tracks.${index}.${field}`),
						)
					}
					onMove={(from, to) => updateTracks(moveTrack(draft.tracks, from, to))}
					onRemove={(index) =>
						updateTracks(draft.tracks.filter((_, i) => i !== index))
					}
					onAdd={() =>
						update({ tracks: [...draft.tracks, newTrack()] }, ["tracks"])
					}
				/>

				<div className="mt-6 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
					{formError && (
						<p role="alert" className="text-sm text-red-600 dark:text-red-400">
							{formError}
						</p>
					)}
					<button
						type="submit"
						disabled={submitting}
						className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:opacity-60"
					>
						{submitting ? "Starting…" : "Convert & download"}
					</button>
				</div>
			</div>
		</form>
	);
}

function focusFirstError(form: HTMLFormElement) {
	requestAnimationFrame(() => {
		form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
	});
}
