import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import appCss from "../styles.css?url";

const DESCRIPTION =
	"Turn YouTube videos into a ZIP of MP3s with album, artist, track numbers and cover art filled in. Works on any MP3 player.";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "TagTape: YouTube to tagged MP3 albums" },
			{ name: "description", content: DESCRIPTION },
			{ name: "theme-color", content: "#059669" },
			{ property: "og:title", content: "TagTape" },
			{ property: "og:description", content: DESCRIPTION },
			{ property: "og:url", content: "https://tagtape.app" },
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "canonical", href: "https://tagtape.app" },
		],
	}),
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body className="min-h-dvh bg-zinc-50 text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
				<div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 sm:px-6">
					<header className="flex items-center gap-2.5 py-6">
						<Logo />
						<span className="text-lg font-bold tracking-tight">TagTape</span>
					</header>
					<main className="flex-1 pb-16">{children}</main>
					<footer className="flex flex-wrap gap-x-6 gap-y-2 border-t border-zinc-200 py-6 text-sm text-zinc-500 dark:border-zinc-800">
						<span>
							Made by{" "}
							<a
								href="https://www.vin.ski"
								className="underline-offset-4 hover:underline"
							>
								Ivan Vinski
							</a>
						</span>
						<a
							href="https://github.com/vindotski/tagtape"
							className="underline-offset-4 hover:underline"
						>
							Source on GitHub
						</a>
					</footer>
				</div>
				<Scripts />
			</body>
		</html>
	);
}

/** A cassette tape: two reels and a label. */
function Logo() {
	return (
		<svg
			viewBox="0 0 32 32"
			className="size-8 text-emerald-600"
			aria-hidden="true"
		>
			<rect x="2" y="7" width="28" height="18" rx="3" fill="currentColor" />
			<rect
				x="6"
				y="10"
				width="20"
				height="9"
				rx="1.5"
				fill="white"
				opacity="0.92"
			/>
			<circle cx="11.5" cy="14.5" r="2.5" fill="currentColor" />
			<circle cx="20.5" cy="14.5" r="2.5" fill="currentColor" />
			<path d="M9 25l2-4h10l2 4" fill="white" opacity="0.5" />
		</svg>
	);
}
