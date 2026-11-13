import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AlbumNotFound } from "#/components/album-not-found";
import { AlbumWorkspace } from "#/components/album-workspace";
import { buttonVariants } from "#/components/ui/button";
import { draftFromAlbum } from "#/lib/album-draft";
import { loadAlbum } from "#/lib/load-album";

export const Route = createFileRoute("/albums/$albumId/edit")({
	loader: ({ params }) => loadAlbum(params.albumId),
	component: EditAlbum,
	notFoundComponent: AlbumNotFound,
});

/** A stored album back in the editor: making it again updates it. */
function EditAlbum() {
	const album = Route.useLoaderData();
	return (
		<>
			<div className="mb-4">
				<Link
					to="/albums/$albumId"
					params={{ albumId: album.id }}
					className={buttonVariants({ variant: "ghost", className: "-ml-2.5" })}
				>
					<ArrowLeft data-icon="inline-start" />
					{album.title}
				</Link>
			</div>
			<h1 className="sr-only">Edit {album.title}</h1>
			<AlbumWorkspace
				// A different album is a fresh editor.
				key={album.id}
				initialDraft={draftFromAlbum(album)}
				albumId={album.id}
			/>
		</>
	);
}
