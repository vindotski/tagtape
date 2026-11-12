import { CircleAlert, Download, ImageIcon, ImagePlus } from "lucide-react";
import { useState } from "react";
import { AlbumCover } from "#/components/album/album-cover";
import {
	AlbumFooter,
	AlbumHeader,
	AlbumShell,
	albumFileName,
} from "#/components/album/album-shell";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { FieldDescription } from "#/components/ui/field";
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
import { TrackLimitsNote, TrackList } from "./track-list";

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
	const [coverOpen, setCoverOpen] = useState(false);
	// Always shown once it has something to show (a link, or an error about it).
	const coverShown =
		coverOpen || draft.coverUrl !== "" || errors.coverUrl !== undefined;

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

	const trackCount = `${draft.tracks.length} ${draft.tracks.length === 1 ? "track" : "tracks"}`;

	return (
		<form noValidate onSubmit={handleSubmit}>
			<AlbumShell
				role="region"
				aria-labelledby="album-heading"
				fileName={albumFileName(draft.artist, draft.title)}
			>
				<h2 id="album-heading" className="sr-only">
					Album
				</h2>
				<AlbumHeader
					cover={
						<CoverButton
							title={draft.title}
							hasCover={draft.coverUrl !== ""}
							expanded={coverShown}
							disabled={submitting}
							onPress={() => {
								setCoverOpen(true);
								// Straight to the field it reveals.
								requestAnimationFrame(() =>
									document.getElementById("coverUrl")?.focus(),
								);
							}}
						/>
					}
				>
					<p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
						Album
					</p>
					<TextField
						id="title"
						label="Album title"
						variant="inline"
						placeholder="Album title"
						value={draft.title}
						onChange={(title) => update({ title }, ["title"])}
						error={errors.title}
						disabled={submitting}
						maxLength={60}
						autoComplete="off"
						inputClassName="font-heading text-2xl font-semibold tracking-tight sm:text-3xl md:text-3xl"
					/>
					<TextField
						id="artist"
						label="Artist"
						variant="inline"
						placeholder="Artist"
						value={draft.artist}
						onChange={(artist) => update({ artist }, ["artist"])}
						error={errors.artist}
						disabled={submitting}
						maxLength={60}
						autoComplete="off"
						className="mt-1"
						inputClassName="text-base text-muted-foreground focus-visible:text-foreground md:text-lg"
					/>
					<div className="mt-2 flex flex-wrap items-start gap-x-2 text-xs text-muted-foreground">
						<TextField
							id="genre"
							label="Genre (optional)"
							variant="inline"
							placeholder="Genre"
							value={draft.genre}
							onChange={(genre) => update({ genre }, ["genre"])}
							error={errors.genre}
							disabled={submitting}
							maxLength={30}
							className="w-20 sm:w-28"
							inputClassName="text-xs md:text-xs"
						/>
						<span aria-hidden="true" className="py-0.5">
							·
						</span>
						<TextField
							id="year"
							label="Year (optional)"
							variant="inline"
							inputMode="numeric"
							placeholder="Year"
							value={draft.year}
							onChange={(year) => update({ year }, ["year"])}
							error={errors.year}
							disabled={submitting}
							maxLength={4}
							className="w-12"
							inputClassName="text-xs tabular-nums md:text-xs"
						/>
						<span aria-hidden="true" className="py-0.5">
							·
						</span>
						<span className="py-0.5">{trackCount}</span>
					</div>
				</AlbumHeader>

				{coverShown && (
					<div className="border-t px-4 py-4 sm:px-6">
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
							className="max-w-xl"
						/>
						<FieldDescription className="mt-2">
							Covers are cropped to a 1000×1000 square. Up to 5 MB.
						</FieldDescription>
					</div>
				)}

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

				<AlbumFooter className="border-t-0">
					<TrackLimitsNote />
					<div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
						{formError && (
							<Alert variant="destructive" role="alert">
								<CircleAlert aria-hidden="true" />
								<AlertDescription>{formError}</AlertDescription>
							</Alert>
						)}
						<Button
							type="submit"
							size="lg"
							isPending={submitting}
							className="shrink-0"
						>
							{submitting ? (
								<Spinner aria-hidden="true" />
							) : (
								<Download aria-hidden="true" />
							)}
							{submitting ? "Starting…" : "Convert & download"}
						</Button>
					</div>
				</AlbumFooter>
			</AlbumShell>
		</form>
	);
}

/** The cover tile doubles as the button that shows the cover image field. */
function CoverButton({
	title,
	hasCover,
	expanded,
	disabled,
	onPress,
}: {
	title: string;
	hasCover: boolean;
	expanded: boolean;
	disabled: boolean;
	onPress: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onPress}
			disabled={disabled}
			aria-expanded={expanded}
			aria-controls={expanded ? "coverUrl" : undefined}
			aria-label={hasCover ? "Change the cover image" : "Add a cover image"}
			className="group/cover relative shrink-0 self-start outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
		>
			<AlbumCover title={title} />
			<span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-background/80 py-1 text-xs text-foreground opacity-0 transition-opacity group-hover/cover:opacity-100 group-focus-visible/cover:opacity-100">
				<ImagePlus className="size-3.5" aria-hidden="true" />
				{hasCover ? "Change cover" : "Add cover"}
			</span>
			{hasCover && (
				<span className="absolute top-1 right-1 grid size-5 place-items-center bg-background/80 text-primary">
					<ImageIcon className="size-3.5" aria-hidden="true" />
				</span>
			)}
		</button>
	);
}

function focusFirstError(form: HTMLFormElement) {
	requestAnimationFrame(() => {
		form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
	});
}
