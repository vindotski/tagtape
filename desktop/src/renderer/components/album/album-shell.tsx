import { FileArchive } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "#/lib/utils";

/** The ZIP's name as the download will roughly call it. */
export function albumFileName(artist: string, title: string): string {
	const parts = [artist.trim(), title.trim()].filter(Boolean);
	return `${parts.length > 0 ? parts.join(" - ") : "Untitled album"}.zip`;
}

/**
 * The album card shared by the home page, the editor and the progress view:
 * a file name strip, then whatever the album shows (header, playlist, footer).
 */
export function AlbumShell({
	fileName,
	className,
	children,
	...props
}: { fileName: string } & ComponentProps<"div">) {
	return (
		<div
			className={cn("border bg-card text-card-foreground shadow-sm", className)}
			{...props}
		>
			<div className="flex items-center gap-2 border-b px-4 py-2.5 text-sm text-muted-foreground">
				<FileArchive className="size-4 shrink-0" aria-hidden="true" />
				<span className="truncate">{fileName}</span>
			</div>
			{children}
		</div>
	);
}

/** Cover on the left, title and details on the right. */
export function AlbumHeader({
	cover,
	children,
	className,
}: {
	cover: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("flex gap-4 p-4 sm:gap-6 sm:p-6", className)}>
			{cover}
			<div className="flex min-w-0 flex-1 flex-col justify-center">
				{children}
			</div>
		</div>
	);
}

/** The bottom bar: notes on the left, actions on the right. */
export function AlbumFooter({
	className,
	children,
}: {
	className?: string;
	children: ReactNode;
}) {
	return (
		<div
			className={cn(
				"flex flex-col gap-3 border-t p-4 sm:flex-row sm:items-center sm:justify-between",
				className,
			)}
		>
			{children}
		</div>
	);
}

/** "Indie · 2026 · 4 tracks", skipping the parts that are empty. */
export function albumMeta(parts: (string | number | null | undefined)[]) {
	return parts.filter((part) => part !== "" && part != null).join(" · ");
}
