import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { ArrowLeft, CircleAlert, Trash2 } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { AlbumWorkspace } from "#/components/album-workspace";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button, buttonVariants } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { draftFromAlbum } from "#/lib/album-draft";
import { fetchAlbum, removeAlbum } from "#/lib/jobs.functions";

const albumIdSchema = z.uuid();

export const Route = createFileRoute("/albums/$albumId")({
	loader: async ({ params }) => {
		// Not an id at all: the same answer as someone else's album.
		if (!albumIdSchema.safeParse(params.albumId).success) throw notFound();
		const album = await fetchAlbum({ data: { id: params.albumId } });
		if (!album) throw notFound();
		return album;
	},
	head: ({ loaderData }) => ({
		meta: [
			{
				title: loaderData
					? `${loaderData.title} · TagTape`
					: "Album not found · TagTape",
			},
		],
	}),
	component: AlbumPage,
	notFoundComponent: AlbumNotFound,
});

function AlbumPage() {
	const album = Route.useLoaderData();
	const navigate = useNavigate();
	return (
		<>
			<div className="mb-6 flex flex-wrap items-center justify-between gap-3">
				<Link
					to="/albums"
					className={buttonVariants({ variant: "ghost", className: "-ml-2.5" })}
				>
					<ArrowLeft data-icon="inline-start" />
					Your albums
				</Link>
				<DeleteAlbum id={album.id} />
			</div>
			<h1 className="sr-only">{album.title}</h1>
			{!album.complete && (
				<Alert className="mb-6">
					<CircleAlert aria-hidden="true" />
					<AlertDescription>
						This album was saved before TagTape kept track links. Add the tracks
						again to make it once more.
					</AlertDescription>
				</Alert>
			)}
			<AlbumWorkspace
				// A different album is a fresh editor.
				key={album.id}
				initialDraft={draftFromAlbum(album)}
				albumId={album.id}
				onStartOver={() => void navigate({ to: "/new" })}
			/>
		</>
	);
}

/** Two steps, so one stray click doesn't lose an album. */
function DeleteAlbum({ id }: { id: string }) {
	const [confirming, setConfirming] = useState(false);
	const [pending, setPending] = useState(false);
	const [failed, setFailed] = useState(false);
	const navigate = useNavigate();
	const router = useRouter();

	async function remove() {
		setPending(true);
		setFailed(false);
		const { ok } = await removeAlbum({ data: { id } }).catch(() => ({
			ok: false,
		}));
		if (ok) {
			await router.invalidate();
			await navigate({ to: "/albums" });
			return;
		}
		setPending(false);
		setFailed(true);
	}

	if (!confirming) {
		return (
			<Button variant="ghost" onPress={() => setConfirming(true)}>
				<Trash2 data-icon="inline-start" />
				Delete album
			</Button>
		);
	}
	return (
		<div className="flex flex-wrap items-center gap-2">
			<span className="text-sm text-muted-foreground" aria-live="polite">
				{failed
					? "Couldn't delete it. Try again?"
					: "Delete this album for good?"}
			</span>
			<Button
				variant="destructive"
				onPress={remove}
				isPending={pending}
				autoFocus
			>
				{pending && <Spinner aria-hidden="true" />}
				Delete
			</Button>
			<Button
				variant="ghost"
				onPress={() => setConfirming(false)}
				isDisabled={pending}
			>
				Cancel
			</Button>
		</div>
	);
}

function AlbumNotFound() {
	return (
		<section className="flex max-w-2xl flex-col items-start gap-4 py-8">
			<h1 className="font-heading text-3xl font-bold tracking-tight">
				This album isn't in your library
			</h1>
			<p className="text-muted-foreground">
				It may have been deleted, or it was made in another browser. Albums
				belong to the browser that made them.
			</p>
			<Link to="/albums" className={buttonVariants({ variant: "outline" })}>
				Your albums
			</Link>
		</section>
	);
}
