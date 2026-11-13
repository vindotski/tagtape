import {
	createRootRoute,
	Outlet,
	useLocation,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { AppSidebar } from "#/components/app-sidebar";
import {
	appPlatform,
	fetchAlbums,
	fetchSources,
	onLibraryChanged,
	onNavigate,
} from "#/lib/bridge";
import { requestNewAlbum } from "#/lib/new-album";
import { readSharedFile, showShared } from "#/lib/shared-album";
import { cn } from "#/lib/utils";

/** How many albums the sidebar lists; the library has them all. */
const RECENT = 8;

export const Route = createRootRoute({
	// Which links the app accepts (its built-in sources, plus any plugins), and
	// the albums made most recently. Both reload when the router is invalidated.
	loader: async () => {
		const [sources, recent] = await Promise.all([
			fetchSources(),
			fetchAlbums(RECENT),
		]);
		return { sources, recent };
	},
	component: Root,
});

/** What the strip at the top of the window says. */
function screenName(path: string): string {
	if (path === "/") return "New album";
	if (path === "/albums") return "Library";
	if (path.startsWith("/albums/")) return "Album";
	if (path === "/settings") return "Settings";
	if (path === "/shared") return "Shared album";
	return "TagTape";
}

/**
 * The whole window: the sidebar, a strip that stands in for the title bar
 * (it moves the window), and the screen itself, which scrolls on its own.
 */
function Root() {
	const { recent } = Route.useLoaderData();
	const path = useLocation({ select: (location) => location.pathname });
	const navigate = useNavigate();
	const router = useRouter();
	// The menu and notifications live in the main process; this is how they
	// change the screen.
	useEffect(
		() =>
			onNavigate((to) => {
				if (to.screen === "new") {
					// Already there: going to it again would leave the editor as it is.
					if (router.state.location.pathname === "/") requestNewAlbum();
					else void navigate({ to: "/" });
				} else if (to.screen === "library") void navigate({ to: "/albums" });
				else if (to.screen === "settings") void navigate({ to: "/settings" });
				else if (to.screen === "shared") {
					showShared(to.share);
					void navigate({ to: "/shared" });
				} else if (to.screen === "album") {
					void navigate({
						to: "/albums/$albumId",
						params: { albumId: to.albumId },
					});
				}
			}),
		[navigate, router],
	);
	// A finished album's folder and cover are kept a moment after its job
	// ends: the lists and the album's screen read them again.
	useEffect(() => onLibraryChanged(() => void router.invalidate()), [router]);
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: a drop target for the whole window; File > Open does the same from the keyboard
		<div
			className="flex h-dvh overflow-hidden select-none"
			// A .tagtape file dropped anywhere on the window opens it. (Links
			// dropped on the album form are text, not files: see album-form.)
			onDragOver={(event) => {
				if (event.dataTransfer.types.includes("Files")) {
					event.preventDefault();
					event.dataTransfer.dropEffect = "copy";
				}
			}}
			onDrop={(event) => {
				const file = event.dataTransfer.files[0];
				if (!file) return;
				event.preventDefault();
				void readSharedFile(file).then((share) => {
					showShared(share);
					void navigate({ to: "/shared" });
				});
			}}
		>
			<AppSidebar recent={recent} />
			<div className="flex min-w-0 flex-1 flex-col bg-muted dark:bg-background">
				<header
					className={cn(
						"app-drag flex h-11 shrink-0 items-center border-b px-6",
						// Windows draws its three buttons over the right end.
						appPlatform() === "win32" && "pr-36",
					)}
				>
					<p className="truncate text-sm font-medium" aria-hidden="true">
						{screenName(path)}
					</p>
				</header>
				<main
					className="min-h-0 flex-1 overflow-y-auto"
					data-scroll-restoration-id="screen"
				>
					<div className="mx-auto max-w-5xl px-6 py-6">
						<Outlet />
					</div>
				</main>
			</div>
		</div>
	);
}
