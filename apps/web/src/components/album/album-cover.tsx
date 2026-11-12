import { Disc3 } from "lucide-react";
import { cn } from "#/lib/utils";

const SIZES = {
	/** Fills its container's width (library tiles). */
	fill: "aspect-square w-full [&_svg]:size-1/3 text-2xl",
	lg: "size-24 sm:size-36 [&_svg]:size-10 sm:[&_svg]:size-14 text-sm sm:text-lg",
};

/**
 * The cover placeholder: TagTape doesn't show the real cover (the page only
 * loads its own images), so albums get a tile with their initials instead.
 */
export function AlbumCover({
	title,
	size = "lg",
	className,
}: {
	title: string;
	size?: keyof typeof SIZES;
	className?: string;
}) {
	const letters = initials(title);
	return (
		<div
			aria-hidden="true"
			className={cn(
				"flex shrink-0 flex-col items-center justify-center gap-1 bg-primary font-heading font-semibold text-primary-foreground select-none",
				SIZES[size],
				className,
			)}
		>
			<Disc3 strokeWidth={1.25} />
			{letters && <span className="leading-none tracking-wide">{letters}</span>}
		</div>
	);
}

/** "Harbour Lights" → "HL": the first letter of the first two words. */
export function initials(title: string): string {
	return title
		.trim()
		.split(/\s+/)
		.slice(0, 2)
		.map((word) => Array.from(word)[0] ?? "")
		.join("")
		.toUpperCase();
}
