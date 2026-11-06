import { SUPPORTED_SITE_NAMES } from "@tagtape/shared";
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import appCss from "../styles.css?url";

const DESCRIPTION = `Turn links from ${SUPPORTED_SITE_NAMES} into a ZIP of MP3s with album, artist, track numbers and cover art filled in. Works on any MP3 player.`;

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "TagTape: links to tagged MP3 albums" },
			{ name: "description", content: DESCRIPTION },
			// The preset's primary, oklch(0.527 0.154 150.069), is Tailwind's green-700.
			{ name: "theme-color", content: "#15803d" },
			{ property: "og:title", content: "TagTape" },
			{ property: "og:description", content: DESCRIPTION },
			{ property: "og:url", content: "https://tagtape.app" },
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
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
			<body className="min-h-dvh bg-muted antialiased dark:bg-background">
				<div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 sm:px-6">
					<header className="flex items-center gap-2.5 py-6">
						<Logo />
						<span className="text-lg font-bold tracking-tight">TagTape</span>
					</header>
					<main className="flex-1 pb-16">{children}</main>
					<footer className="flex flex-wrap gap-x-6 gap-y-2 border-t py-6 text-sm text-muted-foreground">
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
						<a
							href="https://github.com/vindotski/tagtape/blob/main/CHANGELOG.md"
							className="ml-auto tabular-nums underline-offset-4 hover:underline"
						>
							v{__APP_VERSION__}
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
		<svg viewBox="0 0 32 32" className="size-8 text-primary" aria-hidden="true">
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
