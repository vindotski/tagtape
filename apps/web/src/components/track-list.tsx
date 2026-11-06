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
import {
	MAX_TRACK_SECONDS,
	MAX_TRACKS,
	SUPPORTED_SITES,
} from "@tagtape/shared";
import { ArrowDown, ArrowUp, GripVertical, Plus, X } from "lucide-react";
import { Button } from "#/components/ui/button";
import {
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Tooltip, TooltipTrigger } from "#/components/ui/tooltip";
import type { FieldErrors, TrackDraft } from "#/lib/album-draft";
import { cn } from "#/lib/utils";
import { TextField } from "./text-field";

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
		<>
			<CardHeader>
				<CardTitle>
					<h2 id="tracks-heading">Tracks</h2>
				</CardTitle>
				<CardDescription>
					Drag to reorder. Track numbers follow this order.
				</CardDescription>
				<CardAction
					className="text-xs tabular-nums text-muted-foreground"
					aria-live="polite"
				>
					{tracks.length} / {MAX_TRACKS}
				</CardAction>
			</CardHeader>

			<CardContent className="flex flex-col gap-3">
				{errors.tracks && (
					<p className="text-sm text-destructive">{errors.tracks}</p>
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
						<ol className="flex flex-col gap-2">
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
					<Button
						variant="outline"
						className="w-full border-dashed"
						onPress={onAdd}
						isDisabled={disabled}
					>
						<Plus aria-hidden="true" />
						Add track
					</Button>
				)}
				<p className="text-xs text-muted-foreground">
					One track per link, up to {limitText} each. Works with{" "}
					{SUPPORTED_SITES.map((site, i) => (
						<span key={site.id}>
							{i > 0 && (i === SUPPORTED_SITES.length - 1 ? " and " : ", ")}
							<span className="font-medium text-foreground">{site.name}</span>
						</span>
					))}
					.
				</p>
			</CardContent>
		</>
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
				"flex items-start gap-2 rounded-md border bg-card p-2",
				isDragging && "relative z-10 border-primary shadow-lg",
			)}
		>
			{/* dnd-kit needs a plain element for its listeners (pointer + keyboard). */}
			<button
				type="button"
				ref={setActivatorNodeRef}
				{...attributes}
				{...listeners}
				aria-label={`Reorder ${name}`}
				title={`Reorder ${name}`}
				className="flex min-h-9 w-9 shrink-0 cursor-grab touch-none flex-col items-center justify-center self-stretch rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
			>
				<span className="text-xs font-semibold tabular-nums text-foreground">
					{number}
				</span>
				<GripVertical className="size-4" aria-hidden="true" />
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
					className="gap-1"
				/>
				<TextField
					id={`track-${track.key}-url`}
					label={`Track ${number} link`}
					hideLabel
					placeholder="Track link"
					type="url"
					inputMode="url"
					value={track.url}
					onChange={(url) => onChange({ url })}
					error={errors[`tracks.${index}.url`]}
					disabled={disabled}
					className="gap-1"
				/>
			</div>

			<div className="flex shrink-0 flex-col items-center sm:flex-row">
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
