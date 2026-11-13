import { Link } from "@tanstack/react-router";
import { buttonVariants } from "#/components/ui/button";

export function AlbumNotFound() {
	return (
		<section className="flex max-w-2xl flex-col items-start gap-4 py-8">
			<h1 className="font-heading text-2xl font-bold tracking-tight">
				This album isn't in your library
			</h1>
			<p className="text-muted-foreground">
				It may have been deleted. TagTape remembers the last albums made on this
				computer.
			</p>
			<Link to="/albums" className={buttonVariants({ variant: "outline" })}>
				Library
			</Link>
		</section>
	);
}
