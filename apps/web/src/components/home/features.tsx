import type { LucideIcon } from "lucide-react";
import {
	Code,
	HardDriveDownload,
	Puzzle,
	ShieldCheck,
	UserRound,
} from "lucide-react";

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
	{
		icon: HardDriveDownload,
		title: "Works on any MP3 player",
		text: "Standard ID3 tags, zero-padded track numbers and embedded cover art, so the album sorts and shows up right on old players, car stereos and phones alike.",
	},
	{
		icon: UserRound,
		title: "No sign-up, albums kept",
		text: "Your first album gives this browser a guest account. Your albums are kept there, so you can open one, change it and make it again. There's no email or password to hand over.",
	},
	{
		icon: ShieldCheck,
		title: "Your music is never stored",
		text: "Tracks stream straight through the converter into your ZIP, and nothing is written to disk. TagTape keeps only what you typed (album details, track links, the cover's link), and you can delete any album.",
	},
	{
		icon: Puzzle,
		title: "Sources are plugins",
		text: "Out of the box TagTape reads direct links to MP3 files. Other kinds of links come from source plugins loaded by the server.",
	},
	{
		icon: Code,
		title: "Open source, self-hostable",
		text: "The code is on GitHub, and the whole app is one Docker image you can run on your own machine.",
	},
];

export function Features() {
	return (
		<section aria-labelledby="features-title" className="py-12">
			<h2
				id="features-title"
				className="font-heading text-2xl font-bold tracking-tight sm:text-3xl"
			>
				Made for plain MP3 players, and for your privacy
			</h2>
			<ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{FEATURES.map((feature) => (
					<li key={feature.title} className="border bg-card p-5">
						<feature.icon className="size-6 text-primary" aria-hidden="true" />
						<h3 className="mt-4 font-semibold">{feature.title}</h3>
						<p className="mt-1.5 text-sm text-muted-foreground">
							{feature.text}
						</p>
					</li>
				))}
			</ul>
		</section>
	);
}
