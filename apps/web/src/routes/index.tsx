import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Faq } from "#/components/home/faq";
import { Features } from "#/components/home/features";
import { Hero } from "#/components/home/hero";
import { HowItWorks } from "#/components/home/how-it-works";
import { buttonVariants } from "#/components/ui/button";

export const Route = createFileRoute("/")({
	component: Home,
});

function Home() {
	return (
		<>
			<Hero />
			<HowItWorks />
			<Features />
			<Faq />
			<section className="mt-6 flex flex-col items-start gap-5 border bg-card p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
				<div>
					<h2 className="font-heading text-xl font-bold tracking-tight sm:text-2xl">
						Ready to make an album?
					</h2>
					<p className="mt-1.5 text-sm text-muted-foreground">
						It takes about a minute, and there's no account to create.
					</p>
				</div>
				<Link to="/new" className={buttonVariants({ size: "lg" })}>
					Make an album
					<ArrowRight data-icon="inline-end" />
				</Link>
			</section>
		</>
	);
}
