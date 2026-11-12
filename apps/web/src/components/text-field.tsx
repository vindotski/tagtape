import type { ComponentProps } from "react";
import { Field, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { cn } from "#/lib/utils";

interface TextFieldProps
	extends Omit<
		ComponentProps<typeof Input>,
		"onChange" | "value" | "id" | "className"
	> {
	id: string;
	className?: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	error?: string | undefined;
	optional?: boolean;
	/** Visually hide the label (it stays available to screen readers). */
	hideLabel?: boolean;
	/**
	 * `inline`: no box until hovered or focused, so the field reads like the
	 * text it edits (the album view). The label is always visually hidden.
	 */
	variant?: "default" | "inline";
	inputClassName?: string;
}

const INLINE_INPUT =
	"-mx-1.5 h-auto border-transparent bg-transparent px-1.5 py-0.5 shadow-none hover:border-input dark:bg-transparent dark:hover:bg-input/30 focus-visible:bg-background dark:focus-visible:bg-input/30";

/** A labelled input with its error wired up through aria-invalid/aria-describedby. */
export function TextField({
	id,
	label,
	value,
	onChange,
	error,
	optional,
	hideLabel,
	variant = "default",
	className,
	inputClassName,
	...input
}: TextFieldProps) {
	const errorId = `${id}-error`;
	const inline = variant === "inline";
	return (
		<Field data-invalid={error ? true : undefined} className={className}>
			<FieldLabel
				htmlFor={id}
				className={hideLabel || inline ? "sr-only" : undefined}
			>
				{label}
				{optional && (
					<span className="font-normal text-muted-foreground">(optional)</span>
				)}
			</FieldLabel>
			<Input
				id={id}
				name={id}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				aria-invalid={error ? true : undefined}
				aria-describedby={error ? errorId : undefined}
				className={cn(inline && INLINE_INPUT, inputClassName)}
				{...input}
			/>
			{/* Not role="alert": after a submit, focus moves to the first invalid
			    field, which already announces this through aria-describedby. */}
			{error && (
				<p id={errorId} className="text-sm font-normal text-destructive">
					{error}
				</p>
			)}
		</Field>
	);
}
