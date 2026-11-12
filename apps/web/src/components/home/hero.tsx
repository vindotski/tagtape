import { Link } from "@tanstack/react-router";
import { ArrowRight, Disc3, FileArchive, Music } from "lucide-react";
import { buttonVariants } from "#/components/ui/button";

// Made-up names only: the example must never look like a real release.
const EXAMPLE_TRACKS = [
	{ title: "Paper Lanterns", length: "3:41" },
	{ title: "Night Bus", length: "4:12" },
	{ title: "Static Bloom", length: "2:58" },
	{ title: "Low Tide", length: "5:06" },
];

export function Hero() {
	return (
		<section className="grid items-center gap-10 py-8 sm:py-14 lg:grid-cols-[1.1fr_1fr]">
			<div>
				<h1 className="font-heading text-4xl font-bold tracking-tight text-balance sm:text-5xl">
					Track links in, a tagged MP3 album out
				</h1>
				<p className="mt-5 max-w-xl text-lg text-muted-foreground">
					Paste your track links, add the album details, and download a ZIP of
					MP3s with the album, artist, track numbers and cover art already
					filled in. They sort and display properly on any MP3 player.
				</p>
				<div className="mt-8 flex flex-wrap gap-3">
					<Link to="/new" className={buttonVariants({ size: "lg" })}>
						Make an album
						<ArrowRight data-icon="inline-end" />
					</Link>
					<a
						href="#how-it-works"
						className={buttonVariants({ size: "lg", variant: "outline" })}
					>
						How it works
					</a>
				</div>
				<p className="mt-4 text-sm text-muted-foreground">
					Free, no sign-up, and the music is never stored.
				</p>
			</div>
			<ExampleAlbum />
		</section>
	);
}

/** A picture of what you get: an album folder with numbered, tagged files. */
function ExampleAlbum() {
	return (
		<div
			aria-hidden="true"
			className="border bg-card text-card-foreground shadow-sm select-none"
		>
			<div className="flex items-center gap-2 border-b px-4 py-2.5 text-sm text-muted-foreground">
				<FileArchive className="size-4" />
				<span className="truncate">The Lamplighters - Harbour Lights.zip</span>
			</div>
			<div className="flex gap-4 p-4">
				<div className="grid size-24 shrink-0 place-items-center bg-primary text-primary-foreground sm:size-28">
					<Disc3 className="size-12" strokeWidth={1.25} />
				</div>
				<div className="min-w-0 text-sm">
					<p className="font-heading text-lg font-semibold">Harbour Lights</p>
					<p className="text-muted-foreground">The Lamplighters</p>
					<p className="mt-2 text-xs text-muted-foreground">
						Indie · 2026 · {EXAMPLE_TRACKS.length} tracks
					</p>
				</div>
			</div>
			<ol className="border-t">
				{EXAMPLE_TRACKS.map((track, i) => (
					<li
						key={track.title}
						className="flex items-center gap-3 border-b px-4 py-2 text-sm last:border-b-0"
					>
						<Music className="size-4 shrink-0 text-primary" />
						<span className="min-w-0 flex-1 truncate">
							{String(i + 1).padStart(2, "0")} - {track.title}.mp3
						</span>
						<span className="text-muted-foreground tabular-nums">
							{track.length}
						</span>
					</li>
				))}
			</ol>
		</div>
	);
}
