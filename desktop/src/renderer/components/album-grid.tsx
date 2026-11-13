import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { AlbumCover, storedCover } from "#/components/album/album-cover";
import { albumMeta } from "#/components/album/album-shell";
import type { AlbumSummary } from "#/lib/albums";
import { albumMenu, removeAlbum } from "#/lib/bridge";
import { cn } from "#/lib/utils";

// A fixed locale (the app is in English), in this computer's time zone.
export const dateFormat = new Intl.DateTimeFormat("en", {
	dateStyle: "medium",
});

/** A library shelf of album covers, each opening its album. */
export function AlbumGrid({
	albums,
	className,
}: {
	albums: AlbumSummary[];
	className?: string;
}) {
	const navigate = useNavigate();
	const router = useRouter();

	// The menu itself is the system's; main reports what was picked.
	async function openMenu(album: AlbumSummary) {
		const choice = await albumMenu(album.id);
		const params = { albumId: album.id };
		if (choice === "open") {
			await navigate({ to: "/albums/$albumId", params });
		} else if (choice === "again") {
			await navigate({ to: "/albums/$albumId/edit", params });
		} else if (choice === "delete" && (await removeAlbum(album.id))) {
			await router.invalidate();
		}
	}

	return (
		<ul
			className={cn(
				"grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-x-5 gap-y-7",
				className,
			)}
		>
			{albums.map((album) => (
				<li key={album.id} className="min-w-0">
					<Link
						to="/albums/$albumId"
						params={{ albumId: album.id }}
						onContextMenu={(event) => {
							event.preventDefault();
							void openMenu(album);
						}}
						className="group/tile block outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
					>
						<AlbumCover
							title={album.title}
							stored={storedCover(album)}
							size="fill"
							className="shadow-sm transition-[filter] group-hover/tile:brightness-110"
						/>
						<p className="mt-2 truncate font-semibold" title={album.title}>
							{album.title}
						</p>
						<p
							className="truncate text-sm text-muted-foreground"
							title={album.artist}
						>
							{album.artist}
						</p>
						<p className="mt-0.5 truncate text-xs text-muted-foreground">
							{albumMeta([
								album.year,
								`${album.trackCount} ${album.trackCount === 1 ? "track" : "tracks"}`,
							])}
						</p>
					</Link>
				</li>
			))}
		</ul>
	);
}
