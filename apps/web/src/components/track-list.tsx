import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MAX_TRACKS } from "@tagtape/shared";
import type { FieldErrors, TrackDraft } from "#/lib/album-draft";
import { TextField } from "./text-field";

interface TrackListProps {
	tracks: TrackDraft[];
	errors: FieldErrors;
	disabled: boolean;
	onChange: (index: number, patch: Partial<TrackDraft>) => void;
	onMove: (from: number, to: number) => void;
	onRemove: (index: number) => void;
	onAdd: () => void;
}

export function TrackList({
	tracks,
	errors,
	disabled,
	onChange,
	onMove,
	onRemove,
	onAdd,
}: TrackListProps) {
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	function handleDragEnd({ active, over }: DragEndEvent) {
		if (!over || active.id === over.id) return;
		const from = tracks.findIndex((track) => track.key === active.id);
		const to = tracks.findIndex((track) => track.key === over.id);
		if (from !== -1 && to !== -1) onMove(from, to);
	}

	return (
		<section aria-labelledby="tracks-heading">
			<div className="mb-3 flex items-baseline justify-between">
				<h2
					id="tracks-heading"
					className="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
				>
					Tracks
				</h2>
				<span className="text-xs tabular-nums text-zinc-500" aria-live="polite">
					{tracks.length} / {MAX_TRACKS}
				</span>
			</div>
			{errors.tracks && (
				<p className="mb-2 text-xs text-red-600 dark:text-red-400">
					{errors.tracks}
				</p>
			)}

			{/* A fixed id keeps dnd-kit's aria attributes identical on server and client. */}
			<DndContext
				id="tracks"
				sensors={sensors}
				collisionDetection={closestCenter}
				onDragEnd={handleDragEnd}
			>
				<SortableContext
					items={tracks.map((track) => track.key)}
					strategy={verticalListSortingStrategy}
					disabled={disabled}
				>
					<ol className="space-y-2">
						{tracks.map((track, index) => (
							<TrackRow
								key={track.key}
								track={track}
								index={index}
								count={tracks.length}
								errors={errors}
								disabled={disabled}
								onChange={(patch) => onChange(index, patch)}
								onMove={(to) => onMove(index, to)}
								onRemove={() => onRemove(index)}
							/>
						))}
					</ol>
				</SortableContext>
			</DndContext>

			{tracks.length < MAX_TRACKS && (
				<button
					type="button"
					onClick={onAdd}
					disabled={disabled}
					className="mt-3 w-full rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-600 transition hover:border-emerald-500 hover:text-emerald-700 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-emerald-400"
				>
					+ Add track
				</button>
			)}
		</section>
	);
}

interface TrackRowProps {
	track: TrackDraft;
	index: number;
	count: number;
	errors: FieldErrors;
	disabled: boolean;
	onChange: (patch: Partial<TrackDraft>) => void;
	onMove: (to: number) => void;
	onRemove: () => void;
}

function TrackRow({
	track,
	index,
	count,
	errors,
	disabled,
	onChange,
	onMove,
	onRemove,
}: TrackRowProps) {
	const {
		attributes,
		listeners,
		setNodeRef,
		setActivatorNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: track.key, disabled });
	const number = index + 1;
	const name = track.title || `Track ${number}`;

	return (
		<li
			ref={setNodeRef}
			style={{ transform: CSS.Transform.toString(transform), transition }}
			className={`flex items-center gap-2 rounded-xl border bg-white p-2 dark:bg-zinc-900 ${
				isDragging
					? "relative z-10 border-emerald-500 shadow-lg"
					: "border-zinc-200 dark:border-zinc-800"
			}`}
		>
			<button
				type="button"
				ref={setActivatorNodeRef}
				{...attributes}
				{...listeners}
				aria-label={`Reorder ${name}`}
				className="flex w-8 shrink-0 cursor-grab touch-none flex-col items-center justify-center self-stretch rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 active:cursor-grabbing dark:hover:bg-zinc-800"
			>
				<span className="text-xs font-semibold tabular-nums text-zinc-500">
					{number}
				</span>
				<svg
					viewBox="0 0 20 20"
					className="size-4"
					fill="currentColor"
					aria-hidden="true"
				>
					<circle cx="7" cy="5" r="1.5" />
					<circle cx="13" cy="5" r="1.5" />
					<circle cx="7" cy="10" r="1.5" />
					<circle cx="13" cy="10" r="1.5" />
					<circle cx="7" cy="15" r="1.5" />
					<circle cx="13" cy="15" r="1.5" />
				</svg>
			</button>

			<div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
				<TextField
					id={`track-${track.key}-title`}
					label={`Track ${number} title`}
					hideLabel
					placeholder="Title"
					value={track.title}
					onChange={(title) => onChange({ title })}
					error={errors[`tracks.${index}.title`]}
					disabled={disabled}
					maxLength={60}
				/>
				<TextField
					id={`track-${track.key}-url`}
					label={`Track ${number} YouTube link`}
					hideLabel
					placeholder="YouTube link"
					type="url"
					inputMode="url"
					value={track.url}
					onChange={(url) => onChange({ url })}
					error={errors[`tracks.${index}.url`]}
					disabled={disabled}
				/>
			</div>

			<div className="flex shrink-0 flex-col items-center gap-0.5 sm:flex-row">
				<IconButton
					label={`Move ${name} up`}
					disabled={disabled || index === 0}
					onClick={() => onMove(index - 1)}
					path="M10 6l-4 4m4-4l4 4m-4-4v9"
				/>
				<IconButton
					label={`Move ${name} down`}
					disabled={disabled || index === count - 1}
					onClick={() => onMove(index + 1)}
					path="M10 15l-4-4m4 4l4-4m-4 4V6"
				/>
				<IconButton
					label={`Remove ${name}`}
					disabled={disabled || count === 1}
					onClick={onRemove}
					path="M6 6l8 8M14 6l-8 8"
				/>
			</div>
		</li>
	);
}

function IconButton({
	label,
	path,
	disabled,
	onClick,
}: {
	label: string;
	path: string;
	disabled: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			disabled={disabled}
			onClick={onClick}
			className="rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:pointer-events-none disabled:opacity-30 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
		>
			<svg
				viewBox="0 0 20 20"
				className="size-4"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.75"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				<path d={path} />
			</svg>
		</button>
	);
}
