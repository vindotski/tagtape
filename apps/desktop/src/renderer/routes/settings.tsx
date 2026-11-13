import {
	createFileRoute,
	getRouteApi,
	useRouter,
} from "@tanstack/react-router";
import { FolderOpen } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "#/components/ui/button";
import {
	appVersion,
	chooseDestination,
	clearAlbums,
	fetchDestination,
	fetchVersions,
	showDestination,
} from "#/lib/bridge";

const rootRoute = getRouteApi("__root__");

export const Route = createFileRoute("/settings")({
	loader: async () => {
		const [destination, versions] = await Promise.all([
			fetchDestination(),
			fetchVersions(),
		]);
		return { destination, versions };
	},
	component: SettingsPage,
});

function SettingsPage() {
	const loaded = Route.useLoaderData();
	const { sources, recent } = rootRoute.useLoaderData();
	const router = useRouter();
	const [destination, setDestination] = useState(loaded.destination);
	const versions = Object.entries(loaded.versions);

	return (
		<div className="max-w-2xl">
			<h1 className="font-heading text-2xl font-bold tracking-tight">
				Settings
			</h1>

			<Section title="Save folder">
				<p className="text-sm text-muted-foreground">
					Each album gets its own folder in here.
				</p>
				<p
					className="mt-2 truncate font-medium select-text"
					title={destination}
				>
					{destination}
				</p>
				<div className="mt-3 flex flex-wrap gap-2">
					<Button
						variant="outline"
						onPress={() => void chooseDestination().then(setDestination)}
					>
						Change…
					</Button>
					<Button variant="ghost" onPress={() => void showDestination()}>
						<FolderOpen data-icon="inline-start" />
						Open
					</Button>
				</div>
			</Section>

			<Section title="Links it accepts">
				{sources.length > 0 ? (
					<ul className="text-sm">
						{sources.map((source) => (
							<li key={source.id} className="py-0.5">
								{source.name}
							</li>
						))}
					</ul>
				) : (
					<p className="text-sm text-muted-foreground">
						The list couldn't be read.
					</p>
				)}
				<p className="mt-2 text-sm text-muted-foreground">
					One track per link. Playlists, live streams and anything behind a
					login or copy protection are refused.
				</p>
			</Section>

			<Section title="Library">
				<p className="text-sm text-muted-foreground">
					TagTape remembers the albums you made (what you typed and a small
					cover), never the music. Clearing it leaves every album folder where
					it is.
				</p>
				<Button
					variant="outline"
					className="mt-3"
					isDisabled={recent.length === 0}
					onPress={async () => {
						if (await clearAlbums()) await router.invalidate();
					}}
				>
					Clear library…
				</Button>
			</Section>

			<Section title="About">
				<dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm select-text">
					<dt className="text-muted-foreground">TagTape</dt>
					<dd className="tabular-nums">{appVersion()}</dd>
					{versions.map(([name, version]) => (
						<Version key={name} name={name} version={version} />
					))}
				</dl>
				{versions.length === 0 && (
					<p className="mt-2 text-sm text-destructive">
						The bundled programs didn't run. Reinstalling TagTape should fix
						this.
					</p>
				)}
				<p className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
					<ExternalLink href="https://tagtape.app">Website</ExternalLink>
					<ExternalLink href="https://github.com/vindotski/tagtape">
						Source
					</ExternalLink>
					<ExternalLink href="https://github.com/vindotski/tagtape/blob/main/CHANGELOG.md">
						What's new
					</ExternalLink>
				</p>
			</Section>
		</div>
	);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="mt-6 border bg-card p-5">
			<h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
				{title}
			</h2>
			{children}
		</section>
	);
}

/** "ffmpeg version 9.0.2-<builder's address> Copyright …" → "9.0.2". */
function Version({ name, version }: { name: string; version: string }) {
	const short =
		/^(?:\S+ version )?(\S+?)(?:-https?:\S*)?(?:\s|$)/.exec(
			version.trim(),
		)?.[1] ?? version.trim();
	return (
		<>
			<dt className="text-muted-foreground">{name}</dt>
			<dd className="truncate tabular-nums" title={version}>
				{short}
			</dd>
		</>
	);
}

/** Opens in the browser: the window itself never leaves the app. */
function ExternalLink({ href, children }: { href: string; children: string }) {
	return (
		<a
			href={href}
			target="_blank"
			rel="noreferrer"
			className="cursor-pointer underline underline-offset-4 hover:text-primary"
		>
			{children}
		</a>
	);
}
