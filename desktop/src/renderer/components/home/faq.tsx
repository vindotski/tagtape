import {
	MAX_COVER_BYTES,
	MAX_TRACK_SECONDS,
	MAX_TRACKS,
} from "@tagtape/shared";
import { getRouteApi } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

const rootRoute = getRouteApi("__root__");

const trackLimit =
	MAX_TRACK_SECONDS % 3600 === 0
		? `${MAX_TRACK_SECONDS / 3600} hour${MAX_TRACK_SECONDS === 3600 ? "" : "s"}`
		: `${Math.round(MAX_TRACK_SECONDS / 60)} minutes`;

const coverLimit = `${Math.round(MAX_COVER_BYTES / (1024 * 1024))} MB`;

export function Faq() {
	// The accepted links depend on the API's source plugins, so never hard-code them.
	const sources = rootRoute.useLoaderData();

	const questions: { question: string; answer: ReactNode }[] = [
		{
			question: "Which links work?",
			answer:
				sources.length > 0 ? (
					<>
						This server accepts{" "}
						{sources.map((source, i) => (
							<span key={source.id}>
								{i > 0 && (i === sources.length - 1 ? " and " : ", ")}
								<span className="font-medium text-foreground">
									{source.name}
								</span>
							</span>
						))}
						. What works depends on the sources a server runs: direct links to
						MP3 files, single tracks from sites yt-dlp can read when it's on,
						and anything plugins add. Some sites refuse servers they think are
						automated; TagTape then says so and leaves that site alone for a few
						minutes. Direct MP3 links are the most reliable.
					</>
				) : (
					"Direct links to MP3 files, and single tracks from sites yt-dlp can read when the server has it on. Playlists, live streams and anything behind a login aren't supported, and some sites refuse servers they think are automated. Direct MP3 links are the most reliable. Plugins can add more sources."
				),
		},
		{
			question: "How big can an album be?",
			answer: `Up to ${MAX_TRACKS} tracks, each up to ${trackLimit} long, with a cover image of up to ${coverLimit}. Anything that isn't a constant-bitrate MP3 is converted to 256 kbps MP3, so every player reads its length right.`,
		},
		{
			question: "What do you keep about me?",
			answer:
				"When you start your first album, this browser gets a guest account: a cookie, no email or password. TagTape keeps the albums you make, as you typed them (details, track titles and links, the cover's link), so you can open one and make it again. You can delete any of them. The music and the cover image itself are never stored.",
		},
		{
			question: "Is it free?",
			answer:
				"Yes. There are fair-use limits per visitor so the server stays usable for everyone.",
		},
		{
			question: "Can I run it myself?",
			answer: (
				<>
					Yes. TagTape is open source and ships as a single Docker image,{" "}
					<code className="text-foreground">vindotski/tagtape</code>. See the{" "}
					<a
						href="https://github.com/vindotski/tagtape"
						className="text-primary underline-offset-4 hover:underline"
					>
						README on GitHub
					</a>{" "}
					for how to run it.
				</>
			),
		},
	];

	return (
		<section aria-labelledby="faq-title" className="py-12">
			<h2
				id="faq-title"
				className="font-heading text-2xl font-bold tracking-tight sm:text-3xl"
			>
				Questions
			</h2>
			<div className="mt-8 border-t">
				{questions.map((item) => (
					<details key={item.question} className="group border-b">
						<summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
							{item.question}
							<ChevronDown
								className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
								aria-hidden="true"
							/>
						</summary>
						<p className="max-w-3xl pb-5 text-sm text-muted-foreground">
							{item.answer}
						</p>
					</details>
				))}
			</div>
		</section>
	);
}
