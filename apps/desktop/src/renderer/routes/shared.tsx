import { createFileRoute, Link } from "@tanstack/react-router";
import { CircleAlert } from "lucide-react";
import { AlbumWorkspace } from "#/components/album-workspace";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { buttonVariants } from "#/components/ui/button";
import { draftFromShared } from "#/lib/album-draft";
import { useSharedAlbum } from "#/lib/shared-album";

export const Route = createFileRoute("/shared")({
	component: SharedAlbum,
});

/**
 * An album someone shared (a `.tagtape` file or a link), in the editor. It
 * is only shown: nothing is made, or kept in the library, until the user
 * presses Make album.
 */
function SharedAlbum() {
	const shown = useSharedAlbum();

	if (!shown?.share.ok) {
		return (
			<section className="flex max-w-2xl flex-col items-start gap-4">
				<h1 className="font-heading text-2xl font-bold tracking-tight">
					{shown ? "That album couldn't be opened" : "No shared album is open"}
				</h1>
				{shown && !shown.share.ok ? (
					<Alert variant="destructive">
						<CircleAlert aria-hidden="true" />
						<AlertDescription>{shown.share.message}</AlertDescription>
					</Alert>
				) : (
					<p className="text-muted-foreground">
						Open a shared album with File &gt; Open Album File, or drop a
						.tagtape file on this window.
					</p>
				)}
				<Link to="/" className={buttonVariants({ variant: "outline" })}>
					New album
				</Link>
			</section>
		);
	}

	return (
		<>
			<h1 className="sr-only">Shared album</h1>
			<p className="mb-4 text-sm text-muted-foreground">
				<span className="font-medium text-foreground">Shared with you.</span>{" "}
				Check the track links, change what you like, then make the album.
				Nothing is downloaded until you do.
			</p>
			<AlbumWorkspace
				// Another shared album is a fresh editor.
				key={shown.sequence}
				initialDraft={draftFromShared(shown.share.album)}
			/>
		</>
	);
}
