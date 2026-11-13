import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AlbumCover } from "#/components/album/album-cover";
import { albumMeta } from "#/components/album/album-shell";
import type { AlbumSummary } from "#/lib/albums";
import { cn } from "#/lib/utils";

// A fixed locale (the app is in English), in this computer's time zone.
const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

/** Past albums under a "Your albums" heading (the first page). */
export function RecentAlbums({
	albums,
	action,
	className,
}: {
	albums: AlbumSummary[];
	/** Shown next to the heading, e.g. a "See all" link. */
	action?: ReactNode;
	className?: string;
}) {
	return (
		<section className={className} aria-labelledby="recent-albums-title">
			<div className="flex items-baseline justify-between gap-4">
				<h2
					id="recent-albums-title"
					className="font-heading text-xl font-bold tracking-tight sm:text-2xl"
				>
					Your albums
				</h2>
				{action}
			</div>
			<p className="mt-1 text-sm text-muted-foreground">
				Open one to edit it or make it again. The music is never stored.
			</p>
			<AlbumGrid albums={albums} className="mt-6" />
		</section>
	);
}

/** A library shelf of album tiles, each opening its album. */
export function AlbumGrid({
	albums,
	className,
}: {
	albums: AlbumSummary[];
	className?: string;
}) {
	return (
		<ul
			className={cn(
				"grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-5",
				className,
			)}
		>
			{albums.map((album) => (
				<li key={album.id} className="min-w-0">
					<Link
						to="/albums/$albumId"
						params={{ albumId: album.id }}
						className="group/tile block outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
					>
						<AlbumCover
							title={album.title}
							size="fill"
							className="transition-opacity group-hover/tile:opacity-90"
						/>
						<p
							className="mt-2 truncate font-semibold underline-offset-4 group-hover/tile:underline"
							title={album.title}
						>
							{album.title}
						</p>
						<p
							className="truncate text-sm text-muted-foreground"
							title={album.artist}
						>
							{album.artist}
						</p>
						<p className="mt-0.5 text-xs text-muted-foreground">
							{albumMeta([
								album.year,
								`${album.trackCount} ${album.trackCount === 1 ? "track" : "tracks"}`,
							])}
						</p>
						<p className="text-xs text-muted-foreground">
							<span className="sr-only">Last made </span>
							{dateFormat.format(new Date(album.updatedAt))}
						</p>
					</Link>
				</li>
			))}
		</ul>
	);
}
