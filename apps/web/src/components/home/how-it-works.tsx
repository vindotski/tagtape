import { MAX_TRACKS } from "@tagtape/shared";
import { Download, Link2, Tags } from "lucide-react";

const STEPS = [
	{
		icon: Link2,
		title: "Paste the links",
		text: `Add up to ${MAX_TRACKS} track links, one per track, and drag them into album order.`,
	},
	{
		icon: Tags,
		title: "Add the album details",
		text: "Title, artist, genre, year and a cover image. Each track gets its own title.",
	},
	{
		icon: Download,
		title: "Download the ZIP",
		text: "TagTape converts each track to MP3, writes the tags and cover, and hands you one ZIP.",
	},
];

export function HowItWorks() {
	return (
		<section
			id="how-it-works"
			aria-labelledby="how-it-works-title"
			className="scroll-mt-6 py-12"
		>
			<h2
				id="how-it-works-title"
				className="font-heading text-2xl font-bold tracking-tight sm:text-3xl"
			>
				How it works
			</h2>
			<ol className="mt-8 grid gap-4 sm:grid-cols-3">
				{STEPS.map((step, i) => (
					<li key={step.title} className="border bg-card p-5">
						<div className="flex items-center gap-3">
							<span className="grid size-9 place-items-center bg-primary/10 text-primary">
								<step.icon className="size-5" aria-hidden="true" />
							</span>
							<span className="text-sm font-medium text-muted-foreground tabular-nums">
								Step {i + 1}
							</span>
						</div>
						<h3 className="mt-4 font-semibold">{step.title}</h3>
						<p className="mt-1.5 text-sm text-muted-foreground">{step.text}</p>
					</li>
				))}
			</ol>
		</section>
	);
}
