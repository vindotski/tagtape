import type { ComponentProps } from "react";
import { Field, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";

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
}

/** A labelled input with its error wired up through aria-invalid/aria-describedby. */
export function TextField({
	id,
	label,
	value,
	onChange,
	error,
	optional,
	hideLabel,
	className,
	...input
}: TextFieldProps) {
	const errorId = `${id}-error`;
	return (
		<Field data-invalid={error ? true : undefined} className={className}>
			<FieldLabel htmlFor={id} className={hideLabel ? "sr-only" : undefined}>
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
				{...input}
			/>
			{/* Not role="alert": after a submit, focus moves to the first invalid
			    field, which already announces this through aria-describedby. */}
			{error && (
				<p id={errorId} className="text-sm text-destructive">
					{error}
				</p>
			)}
		</Field>
	);
}
