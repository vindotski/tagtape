import { createFileRoute, Link } from "@tanstack/react-router";
import { FolderOpen, Pencil, Share2 } from "lucide-react";
import { useState } from "react";
import { AlbumCover, storedCover } from "#/components/album/album-cover";
import { albumMeta } from "#/components/album/album-shell";
import { dateFormat } from "#/components/album-grid";
import { AlbumNotFound } from "#/components/album-not-found";
import { DeleteAlbum } from "#/components/delete-album";
import { Button, buttonVariants } from "#/components/ui/button";
import type { StoredAlbum } from "#/lib/albums";
import { shareAlbum, showAlbumFolder } from "#/lib/bridge";
import { loadAlbum } from "#/lib/load-album";

export const Route = createFileRoute("/albums/$albumId/")({
	loader: ({ params }) => loadAlbum(params.albumId),
	component: AlbumPage,
	notFoundComponent: AlbumNotFound,
});

/** A made album, as a music app would show it: cover, details, tracks. */
function AlbumPage() {
	const album = Route.useLoaderData();
	// Another album is a fresh screen: no "Link copied", no armed Delete.
	return <AlbumView key={album.id} album={album} />;
}

function AlbumView({ album }: { album: StoredAlbum }) {
	// What the last share did, said once under the buttons.
	const [shared, setShared] = useState<"file" | "link" | null>(null);
	const tracks = `${album.trackCount} ${album.trackCount === 1 ? "track" : "tracks"}`;
	return (
		<article className="select-text">
			<header className="flex flex-wrap items-end gap-6">
				<AlbumCover
					title={album.title}
					stored={storedCover(album)}
					size="xl"
					className="shadow-md"
				/>
				<div className="min-w-0 flex-1">
					<p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
						Album
					</p>
					<h1 className="mt-1 font-heading text-3xl font-bold tracking-tight break-words md:text-4xl">
						{album.title}
					</h1>
					<p className="mt-1 text-lg text-muted-foreground">{album.artist}</p>
					<p className="mt-2 text-sm text-muted-foreground">
						{albumMeta([album.genre, album.year, tracks])}
						<span aria-hidden="true"> · </span>
						Last made {dateFormat.format(new Date(album.updatedAt))}
					</p>
				</div>
			</header>

			<div className="mt-6 flex flex-wrap items-center gap-2 select-none">
				<Button
					isDisabled={album.folder !== "saved"}
					onPress={() => void showAlbumFolder(album.id)}
				>
					<FolderOpen data-icon="inline-start" />
					Show in folder
				</Button>
				<Link
					to="/albums/$albumId/edit"
					params={{ albumId: album.id }}
					className={buttonVariants({ variant: "outline" })}
				>
					<Pencil data-icon="inline-start" />
					Edit and make again
				</Link>
				<Button
					variant="outline"
					onPress={async () => setShared(await shareAlbum(album.id))}
				>
					<Share2 data-icon="inline-start" />
					Share
				</Button>
				<div className="ml-auto">
					<DeleteAlbum id={album.id} />
				</div>
			</div>
			<p
				className="mt-2 text-sm text-muted-foreground empty:hidden"
				role="status"
			>
				{shared === "link" &&
					"Link copied. It holds the album's details and track links, never the music."}
				{shared === "file" &&
					"Saved. The file holds the album's details and track links, never the music."}
			</p>
			{album.folder !== "saved" && (
				<p className="mt-2 text-sm text-muted-foreground">
					{album.folder === "missing"
						? "Its folder isn't where it was saved any more (moved, renamed or deleted). Make it again to get a new one."
						: "This album didn't finish, so there's no folder yet. Make it again to get one."}
				</p>
			)}

			<ol aria-label="Tracks" className="mt-8 border bg-card">
				{album.tracks.map((track, index) => (
					<li
						// Titles can repeat; the position can't.
						// biome-ignore lint/suspicious/noArrayIndexKey: a fixed list
						key={index}
						className="flex items-baseline gap-4 border-b px-4 py-2.5 last:border-b-0"
					>
						<span className="w-6 shrink-0 text-right text-sm text-muted-foreground tabular-nums">
							{String(index + 1).padStart(2, "0")}
						</span>
						<span className="min-w-0 flex-1 truncate font-medium">
							{track.title}
						</span>
					</li>
				))}
			</ol>
		</article>
	);
}
