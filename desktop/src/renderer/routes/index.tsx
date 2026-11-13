import { createFileRoute } from "@tanstack/react-router";
import { AlbumWorkspace } from "#/components/album-workspace";
import { emptyDraft } from "#/lib/album-draft";

export const Route = createFileRoute("/")({
	component: NewAlbum,
});

function NewAlbum() {
	return (
		<>
			<h1 className="sr-only">New album</h1>
			<AlbumWorkspace initialDraft={emptyDraft()} />
		</>
	);
}
