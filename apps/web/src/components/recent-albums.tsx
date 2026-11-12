import { AlbumCover } from "#/components/album/album-cover";
import { albumMeta } from "#/components/album/album-shell";
import type { AlbumSummary } from "#/lib/albums";

// A fixed locale and time zone, so the server and browser render the same text.
const dateFormat = new Intl.DateTimeFormat("en", {
	dateStyle: "medium",
	timeZone: "UTC",
});

/** The albums this browser's guest has started, newest first, as a library shelf. */
export function RecentAlbums({ albums }: { albums: AlbumSummary[] }) {
	if (albums.length === 0) return null;
	return (
		<section className="mt-12" aria-labelledby="recent-albums-title">
			<h2
				id="recent-albums-title"
				className="font-heading text-xl font-bold tracking-tight sm:text-2xl"
			>
				Your albums
			</h2>
			<p className="mt-1 text-sm text-muted-foreground">
				Albums you've started in this browser. Only the album details are kept,
				never the links or the music.
			</p>
			<ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
				{albums.map((album) => (
					<li key={album.id} className="min-w-0">
						<AlbumCover title={album.title} size="fill" />
						<p className="mt-2 truncate font-semibold" title={album.title}>
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
							<span className="sr-only">Started </span>
							{dateFormat.format(new Date(album.createdAt))}
						</p>
					</li>
				))}
			</ul>
		</section>
	);
}
