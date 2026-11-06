import type { InputHTMLAttributes } from "react";

interface TextFieldProps
	extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	error?: string | undefined;
	optional?: boolean;
	/** Visually hide the label (it stays available to screen readers). */
	hideLabel?: boolean;
}

export function TextField({
	id,
	label,
	value,
	onChange,
	error,
	optional,
	hideLabel,
	className = "",
	...input
}: TextFieldProps) {
	const errorId = `${id}-error`;
	return (
		<div className={className}>
			<label
				htmlFor={id}
				className={
					hideLabel
						? "sr-only"
						: "mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
				}
			>
				{label}
				{optional && (
					<span className="ml-1 font-normal text-zinc-400">(optional)</span>
				)}
			</label>
			<input
				id={id}
				name={id}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				aria-invalid={error ? true : undefined}
				aria-describedby={error ? errorId : undefined}
				className={`block w-full rounded-lg border bg-white px-3 py-2 text-sm text-zinc-900 shadow-xs outline-none transition placeholder:text-zinc-400 focus:ring-2 dark:bg-zinc-900 dark:text-zinc-100 ${
					error
						? "border-red-400 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500/70"
						: "border-zinc-300 focus:border-emerald-500 focus:ring-emerald-500/20 dark:border-zinc-700"
				}`}
				{...input}
			/>
			{error && (
				<p id={errorId} className="mt-1 text-xs text-red-600 dark:text-red-400">
					{error}
				</p>
			)}
		</div>
	);
}
