import { MAX_TRACKS } from "@tagtape/shared";
import {
	CircleAlert,
	FolderOpen,
	ImageIcon,
	ImagePlus,
	Music,
} from "lucide-react";
import { useEffect, useState } from "react";
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
	addLinks,
	type FieldErrors,
	linksFromText,
	moveTrack,
	newTrack,
	type TrackDraft,
	validateDraft,
} from "#/lib/album-draft";
import { chooseDestination, fetchDestination, startJob } from "#/lib/bridge";
import { TextField } from "./text-field";
import { TrackLimitsNote, TrackList } from "./track-list";

interface AlbumFormProps {
	draft: AlbumDraft;
	onDraftChange: (draft: AlbumDraft) => void;
	/** Errors from a previous attempt, e.g. per-track problems the check found. */
	initialErrors?: FieldErrors;
	/** The stored album being made again, if any: it's updated, not duplicated. */
	albumId?: string | undefined;
	onStarted: (jobId: string, albumId: string | undefined) => void;
}

export function AlbumForm({
	draft,
	onDraftChange,
	initialErrors,
	albumId,
	onStarted,
}: AlbumFormProps) {
	const [errors, setErrors] = useState<FieldErrors>(initialErrors ?? {});
	const [formError, setFormError] = useState<string>();
	const [submitting, setSubmitting] = useState(false);
	// Where albums are saved: the app remembers it between albums.
	const [destination, setDestination] = useState<string>();
	useEffect(() => {
		let current = true;
		void fetchDestination().then((folder) => {
			if (current) setDestination(folder);
		});
		return () => {
			current = false;
		};
	}, []);
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

	// Several links at once (pasted, or dropped from a browser or a text
	// file): one track each. A single pasted link is left to the field.
	const [linksNote, setLinksNote] = useState<string>();
	function takeLinks(links: string[], from = 0) {
		const added = addLinks(draft.tracks, links, from);
		updateTracks(added.tracks);
		setLinksNote(
			added.left > 0
				? `An album holds ${MAX_TRACKS} tracks: ${added.left} ${added.left === 1 ? "link was" : "links were"} left out.`
				: undefined,
		);
	}
	function handlePaste(event: React.ClipboardEvent<HTMLFormElement>) {
		const field = event.target;
		if (!(field instanceof HTMLInputElement) || field.type !== "url") return;
		const links = linksFromText(event.clipboardData.getData("text/plain"));
		if (links.length < 2 || field.id === "coverUrl") return;
		event.preventDefault();
		const index = draft.tracks.findIndex(
			(track) => `track-${track.key}-url` === field.id,
		);
		takeLinks(links, Math.max(index, 0));
	}
	const droppedLinks = (data: DataTransfer) =>
		linksFromText(data.getData("text/uri-list") || data.getData("text/plain"));
	const carriesText = (data: DataTransfer) =>
		data.types.includes("text/uri-list") || data.types.includes("text/plain");

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
			const response = await startJob({ album: result.input, albumId });
			if (response.ok) {
				onStarted(response.jobId, response.albumId);
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
		<form noValidate onSubmit={handleSubmit} onPaste={handlePaste}>
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
							onDropLink={(coverUrl) => {
								setCoverOpen(true);
								update({ coverUrl }, ["coverUrl"]);
							}}
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

				{/* biome-ignore lint/a11y/noStaticElementInteractions: a drop target only; pasting does the same from the keyboard */}
				<div
					onDragOver={(event) => {
						if (!submitting && carriesText(event.dataTransfer)) {
							event.preventDefault();
							event.dataTransfer.dropEffect = "copy";
						}
					}}
					onDrop={(event) => {
						if (submitting) return;
						const links = droppedLinks(event.dataTransfer);
						if (links.length === 0) return;
						event.preventDefault();
						takeLinks(links);
					}}
				>
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
						onMove={(from, to) =>
							updateTracks(moveTrack(draft.tracks, from, to))
						}
						onRemove={(index) =>
							updateTracks(draft.tracks.filter((_, i) => i !== index))
						}
						onAdd={() =>
							update({ tracks: [...draft.tracks, newTrack()] }, ["tracks"])
						}
					/>
				</div>
				{linksNote && (
					<p
						role="status"
						className="border-t px-4 py-2 text-sm text-muted-foreground sm:px-6"
					>
						{linksNote}
					</p>
				)}

				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-4 py-3 text-sm sm:px-6">
					<span className="text-muted-foreground">Save in</span>
					<span
						className="min-w-0 flex-1 truncate font-medium"
						title={destination}
					>
						{destination ?? "…"}
					</span>
					<Button
						variant="outline"
						size="sm"
						isDisabled={submitting}
						onPress={() => void chooseDestination().then(setDestination)}
					>
						<FolderOpen data-icon="inline-start" />
						Change…
					</Button>
				</div>

				<AlbumFooter>
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
								<Music aria-hidden="true" />
							)}
							{submitting ? "Starting…" : "Make album"}
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
	onDropLink,
}: {
	title: string;
	hasCover: boolean;
	expanded: boolean;
	disabled: boolean;
	onPress: () => void;
	/** An image link was dropped on the tile. */
	onDropLink: (url: string) => void;
}) {
	return (
		<button
			type="button"
			onClick={onPress}
			onDragOver={(event) => {
				if (disabled) return;
				event.preventDefault();
				event.dataTransfer.dropEffect = "copy";
			}}
			onDrop={(event) => {
				const [link] = linksFromText(
					event.dataTransfer.getData("text/uri-list") ||
						event.dataTransfer.getData("text/plain"),
				);
				if (disabled || !link) return;
				event.preventDefault();
				event.stopPropagation();
				onDropLink(link);
			}}
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
