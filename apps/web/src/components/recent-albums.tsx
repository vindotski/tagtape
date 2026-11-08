import { Disc3 } from "lucide-react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import {
	Item,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemMedia,
	ItemTitle,
} from "#/components/ui/item";
import type { AlbumSummary } from "#/lib/albums";

// A fixed locale and time zone, so the server and browser render the same text.
const dateFormat = new Intl.DateTimeFormat("en", {
	dateStyle: "medium",
	timeZone: "UTC",
});

/** The albums this browser's guest has started, newest first. */
export function RecentAlbums({ albums }: { albums: AlbumSummary[] }) {
	if (albums.length === 0) return null;
	return (
		<Card className="mt-10" aria-labelledby="recent-albums-title">
			<CardHeader>
				<CardTitle id="recent-albums-title">Your albums</CardTitle>
				<CardDescription>
					Albums you've started in this browser. Only the album details are
					kept, never the links or the music.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<ItemGroup role="list" className="gap-1">
					{albums.map((album) => (
						<Item key={album.id} size="xs" role="listitem">
							<ItemMedia className="text-muted-foreground">
								<Disc3 aria-hidden="true" className="size-4" />
							</ItemMedia>
							<ItemContent>
								<ItemTitle>
									{album.title}
									<span className="font-normal text-muted-foreground">
										{" "}
										by {album.artist}
									</span>
								</ItemTitle>
								<ItemDescription>{details(album)}</ItemDescription>
							</ItemContent>
						</Item>
					))}
				</ItemGroup>
			</CardContent>
		</Card>
	);
}

function details(album: AlbumSummary): string {
	return [
		album.year,
		album.genre,
		`${album.trackCount} ${album.trackCount === 1 ? "track" : "tracks"}`,
		`started ${dateFormat.format(new Date(album.createdAt))}`,
	]
		.filter(Boolean)
		.join(" · ");
}
