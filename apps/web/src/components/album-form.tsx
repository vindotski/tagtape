import { CircleAlert } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { FieldDescription, FieldGroup } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import {
	type AlbumDraft,
	type FieldErrors,
	moveTrack,
	newTrack,
	type TrackDraft,
	validateDraft,
} from "#/lib/album-draft";
import { startJob } from "#/lib/jobs.functions";
import { usePow } from "#/lib/use-pow";
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
	const takeProof = usePow();

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
			// A proof-of-work keeps scripts from starting albums in bulk; it's
			// usually solved already, in the background, while the form was filled in.
			let response = await startJob({
				data: { album: result.input, proof: await takeProof() },
			});
			if (!response.ok && response.retryProof) {
				// Expired or used up (e.g. the server restarted): one fresh try.
				response = await startJob({
					data: { album: result.input, proof: await takeProof() },
				});
			}
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
			className="grid items-start gap-6 lg:grid-cols-[22rem_1fr]"
		>
			<Card role="region" aria-labelledby="album-heading">
				<CardHeader>
					<CardTitle>
						<h2 id="album-heading">Album</h2>
					</CardTitle>
					<CardDescription>Written into every track's tags.</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup className="gap-5">
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
						<FieldDescription className="-mt-3">
							Covers are cropped to a 1000×1000 square. Up to 5 MB.
						</FieldDescription>
					</FieldGroup>
				</CardContent>
			</Card>

			<Card role="region" aria-labelledby="tracks-heading">
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

				<CardFooter className="flex-col items-stretch gap-3 border-t sm:flex-row sm:items-center sm:justify-end">
					{formError && (
						<Alert variant="destructive" role="alert" className="sm:mr-auto">
							<CircleAlert aria-hidden="true" />
							<AlertDescription>{formError}</AlertDescription>
						</Alert>
					)}
					<Button type="submit" size="lg" isPending={submitting}>
						{submitting && <Spinner aria-hidden="true" />}
						{submitting ? "Starting…" : "Convert & download"}
					</Button>
				</CardFooter>
			</Card>
		</form>
	);
}

function focusFirstError(form: HTMLFormElement) {
	requestAnimationFrame(() => {
		form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
	});
}
