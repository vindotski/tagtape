import { MAX_TRACKS } from "@tagtape/shared";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlbumWorkspace } from "#/components/album-workspace";
import { RecentAlbums } from "#/components/recent-albums";
import { buttonVariants } from "#/components/ui/button";
import { emptyDraft } from "#/lib/album-draft";
import { fetchAlbums } from "#/lib/jobs.functions";

/** How many of the visitor's albums this page shows; /albums has them all. */
const RECENT = 10;

export const Route = createFileRoute("/new")({
	head: () => ({ meta: [{ title: "Make an album · TagTape" }] }),
	loader: () => fetchAlbums({ data: { limit: RECENT } }),
	component: NewAlbum,
});

function NewAlbum() {
	const albums = Route.useLoaderData();
	return (
		<>
			<section className="mb-10 max-w-2xl">
				<h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
					Links to a tagged MP3 album
				</h1>
				<p className="mt-3 text-muted-foreground">
					Paste up to {MAX_TRACKS} track links, add the album details, and
					download a ZIP of MP3s with titles, track numbers and cover art
					already filled in, so they show up properly on any MP3 player.
				</p>
			</section>

			<AlbumWorkspace initialDraft={emptyDraft()} />

			{albums.length > 0 && (
				<RecentAlbums
					albums={albums}
					className="mt-12"
					action={
						albums.length >= RECENT && (
							<Link
								to="/albums"
								className={buttonVariants({ variant: "ghost", size: "sm" })}
							>
								See all
							</Link>
						)
					}
				/>
			)}
		</>
	);
}
