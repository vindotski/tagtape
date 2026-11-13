import { Link } from "@tanstack/react-router";
import { LibraryBig, type LucideIcon, Plus } from "lucide-react";
import type { ReactNode } from "react";
import type { AlbumSummary } from "#/lib/albums";
import { appPlatform } from "#/lib/bridge";
import { cn } from "#/lib/utils";

const ITEM =
	"flex h-9 items-center gap-3 px-3 text-sm outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 max-md:justify-center max-md:px-0";
const ACTIVE = "bg-sidebar-accent font-medium text-sidebar-accent-foreground";

/**
 * The app's left edge: where to go, and the albums made most recently. It
 * shrinks to icons when the window is narrow. Its empty parts move the window.
 */
export function AppSidebar({ recent }: { recent: AlbumSummary[] }) {
	const mac = appPlatform() === "darwin";
	return (
		<aside className="app-drag flex w-14 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:w-56">
			{/* On macOS the traffic lights sit here. */}
			<div className={cn("shrink-0", mac ? "h-11" : "h-3")} />
			<div className="flex h-10 shrink-0 items-center gap-2.5 px-3 max-md:justify-center max-md:px-0">
				<Logo />
				<span className="text-base font-bold tracking-tight max-md:hidden">
					TagTape
				</span>
			</div>
			<nav aria-label="Main" className="mt-2 flex flex-col">
				<NavItem to="/" icon={Plus} exact>
					New album
				</NavItem>
				<NavItem to="/albums" icon={LibraryBig} exact>
					Library
				</NavItem>
			</nav>
			{recent.length > 0 && (
				<section
					aria-labelledby="sidebar-recent"
					className="mt-6 flex min-h-0 flex-col max-md:hidden"
				>
					<h2
						id="sidebar-recent"
						className="px-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase"
					>
						Recent
					</h2>
					<ul className="app-no-drag min-h-0 overflow-y-auto">
						{recent.map((album) => (
							<li key={album.id}>
								<Link
									to="/albums/$albumId"
									params={{ albumId: album.id }}
									className={cn(ITEM, "h-8")}
									activeProps={{ className: ACTIVE }}
									title={`${album.title} · ${album.artist}`}
								>
									<span className="truncate">{album.title}</span>
								</Link>
							</li>
						))}
					</ul>
				</section>
			)}
		</aside>
	);
}

function NavItem({
	to,
	icon: Icon,
	exact,
	children,
}: {
	to: "/" | "/albums";
	icon: LucideIcon;
	exact?: boolean;
	children: ReactNode;
}) {
	return (
		<Link
			to={to}
			className={ITEM}
			activeProps={{ className: ACTIVE }}
			activeOptions={{ exact: exact === true }}
		>
			<Icon className="size-4 shrink-0" aria-hidden="true" />
			<span className="max-md:sr-only">{children}</span>
		</Link>
	);
}

/** A cassette tape: two reels and a label. */
function Logo() {
	return (
		<svg
			viewBox="0 0 32 32"
			className="size-7 shrink-0 text-primary"
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
