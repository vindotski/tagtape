import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { AlbumGrid } from "#/components/recent-albums";
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
			<section className="mb-8 flex flex-wrap items-end justify-between gap-4">
				<div className="max-w-2xl">
					<h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
						Your albums
					</h1>
					<p className="mt-3 text-muted-foreground">
						The albums you've made on this computer, up to the last{" "}
						{HISTORY_LIMIT}. Open one to edit it, make it again, or delete it.
						TagTape keeps what you typed, never the music.
					</p>
				</div>
			</section>
			{albums.length > 0 ? (
				<AlbumGrid albums={albums} />
			) : (
				<div className="flex flex-col items-start gap-4 border border-dashed bg-card p-8">
					<p className="text-muted-foreground">
						No albums yet. The albums you make show up here.
					</p>
					<Link to="/" className={buttonVariants()}>
						Make an album
						<ArrowRight data-icon="inline-end" />
					</Link>
				</div>
			)}
		</>
	);
}
