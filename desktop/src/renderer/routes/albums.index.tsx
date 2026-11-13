import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { AlbumGrid } from "#/components/album-grid";
import { buttonVariants } from "#/components/ui/button";
import { HISTORY_LIMIT } from "#/lib/albums";
import { fetchAlbums } from "#/lib/bridge";

export const Route = createFileRoute("/albums/")({
	loader: () => fetchAlbums(HISTORY_LIMIT),
	component: Albums,
});

function Albums() {
	const albums = Route.useLoaderData();
	return (
		<>
			<div className="mb-6 flex items-baseline justify-between gap-4">
				<h1 className="font-heading text-2xl font-bold tracking-tight">
					Library
				</h1>
				{albums.length > 0 && (
					<p className="text-sm text-muted-foreground">
						{albums.length} {albums.length === 1 ? "album" : "albums"}
					</p>
				)}
			</div>
			{albums.length > 0 ? (
				<>
					<AlbumGrid albums={albums} />
					<p className="mt-10 text-xs text-muted-foreground">
						The last {HISTORY_LIMIT} albums made on this computer. TagTape keeps
						what you typed and a small cover, never the music.
					</p>
				</>
			) : (
				<div className="flex flex-col items-start gap-4 border border-dashed bg-card p-8">
					<p className="text-muted-foreground">
						No albums yet. The albums you make show up here.
					</p>
					<Link to="/" className={buttonVariants()}>
						<Plus data-icon="inline-start" />
						New album
					</Link>
				</div>
			)}
		</>
	);
}
