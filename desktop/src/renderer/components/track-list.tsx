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
import { MAX_TRACK_SECONDS, MAX_TRACKS } from "@tagtape/shared";
import { getRouteApi } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, GripVertical, Plus, X } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Tooltip, TooltipTrigger } from "#/components/ui/tooltip";
import type { FieldErrors, TrackDraft } from "#/lib/album-draft";
import { cn } from "#/lib/utils";
import { TextField } from "./text-field";

const rootRoute = getRouteApi("__root__");

/** "2 hours", from the shared limit. */
const limitText =
	MAX_TRACK_SECONDS % 3600 === 0
		? `${MAX_TRACK_SECONDS / 3600} hour${MAX_TRACK_SECONDS === 3600 ? "" : "s"}`
		: `${Math.round(MAX_TRACK_SECONDS / 60)} minutes`;

interface TrackListProps {
	tracks: TrackDraft[];
	errors: FieldErrors;
	disabled: boolean;
	onChange: (index: number, patch: Partial<TrackDraft>) => void;
	onMove: (from: number, to: number) => void;
	onRemove: (index: number) => void;
	onAdd: () => void;
}

/**
 * Reordering uses dnd-kit, not React Aria's GridList: a GridList is a single
 * Tab stop whose rows are entered with arrow keys, which text inputs inside
 * the rows swallow. Here every input and button stays in the normal Tab order.
 */
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
		<section aria-labelledby="tracks-heading" className="border-t">
			<div className="flex items-baseline gap-3 border-b px-2 py-2 text-xs text-muted-foreground sm:px-4">
				<span className="w-9 shrink-0 text-center" aria-hidden="true">
					#
				</span>
				<h2
					id="tracks-heading"
					className="font-medium tracking-wide text-foreground uppercase"
				>
					Tracks
				</h2>
				<span className="hidden sm:inline">
					Drag to reorder. Track numbers follow this order.
				</span>
				<span className="ml-auto tabular-nums" aria-live="polite">
					{tracks.length} / {MAX_TRACKS}
				</span>
			</div>

			{errors.tracks && (
				<p className="border-b px-4 py-2 text-sm text-destructive">
					{errors.tracks}
				</p>
			)}

			{/* A fixed id keeps dnd-kit's aria attributes stable between renders. */}
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
					<ol>
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
					className="flex w-full items-center gap-2 px-2 py-3 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:bg-muted/50 focus-visible:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-50 sm:px-4"
				>
					<span className="grid w-9 shrink-0 place-items-center">
						<Plus className="size-4" aria-hidden="true" />
					</span>
					Add track
				</button>
			)}
		</section>
	);
}

/** "One track per link, up to 2 hours each. Works with …", for the album footer. */
export function TrackLimitsNote() {
	const { sources } = rootRoute.useLoaderData();
	return (
		<p className="text-xs text-muted-foreground">
			One track per link, up to {limitText} each.
			{sources.length > 0 && (
				<>
					{" "}
					Works with{" "}
					{sources.map((source, i) => (
						<span key={source.id}>
							{i > 0 && (i === sources.length - 1 ? " and " : ", ")}
							<span className="font-medium text-foreground">{source.name}</span>
						</span>
					))}
					.
				</>
			)}
		</p>
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
			className={cn(
				"group/row flex items-start gap-2 border-b bg-card px-2 py-2 transition-colors hover:bg-muted/50 focus-within:bg-muted/50 sm:px-4",
				isDragging && "relative z-10 bg-muted ring-2 ring-primary",
			)}
		>
			{/* dnd-kit needs a plain element for its listeners (pointer + keyboard).
			    The number turns into the grip while the row is hovered or focused. */}
			<button
				type="button"
				ref={setActivatorNodeRef}
				{...attributes}
				{...listeners}
				aria-label={`Reorder ${name}`}
				title={`Reorder ${name}`}
				className="grid min-h-9 w-9 shrink-0 cursor-grab touch-none place-items-center self-stretch text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
			>
				<span className="text-sm tabular-nums group-focus-within/row:hidden group-hover/row:hidden">
					{String(number).padStart(2, "0")}
				</span>
				<GripVertical
					className="hidden size-4 group-focus-within/row:block group-hover/row:block"
					aria-hidden="true"
				/>
			</button>

			<div className="grid min-w-0 flex-1">
				<TextField
					id={`track-${track.key}-title`}
					label={`Track ${number} title`}
					variant="inline"
					placeholder={`Track ${number} title`}
					value={track.title}
					onChange={(title) => onChange({ title })}
					error={errors[`tracks.${index}.title`]}
					disabled={disabled}
					maxLength={60}
					autoComplete="off"
					className="gap-0.5"
					inputClassName="font-medium"
				/>
				<TextField
					id={`track-${track.key}-url`}
					label={`Track ${number} link`}
					variant="inline"
					placeholder="Paste the track link"
					type="url"
					inputMode="url"
					value={track.url}
					onChange={(url) => onChange({ url })}
					error={errors[`tracks.${index}.url`]}
					disabled={disabled}
					className="gap-0.5"
					inputClassName="text-xs text-muted-foreground focus-visible:text-foreground md:text-xs"
				/>
			</div>

			{/* Shown on hover or focus where there's a mouse; always on touch screens. */}
			<div className="flex shrink-0 flex-col items-center transition-opacity sm:flex-row [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within/row:opacity-100 [@media(hover:hover)]:group-hover/row:opacity-100">
				<IconButton
					label={`Move ${name} up`}
					disabled={disabled || index === 0}
					onPress={() => onMove(index - 1)}
				>
					<ArrowUp aria-hidden="true" />
				</IconButton>
				<IconButton
					label={`Move ${name} down`}
					disabled={disabled || index === count - 1}
					onPress={() => onMove(index + 1)}
				>
					<ArrowDown aria-hidden="true" />
				</IconButton>
				<IconButton
					label={`Remove ${name}`}
					disabled={disabled || count === 1}
					onPress={onRemove}
				>
					<X aria-hidden="true" />
				</IconButton>
			</div>
		</li>
	);
}

function IconButton({
	label,
	disabled,
	onPress,
	children,
}: {
	label: string;
	disabled: boolean;
	onPress: () => void;
	children: React.ReactNode;
}) {
	return (
		<TooltipTrigger>
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label={label}
				isDisabled={disabled}
				onPress={onPress}
			>
				{children}
			</Button>
			<Tooltip>{label}</Tooltip>
		</TooltipTrigger>
	);
}
