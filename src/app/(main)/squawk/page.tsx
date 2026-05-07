import type { Metadata } from "next";
import Link from "next/link";

import { editionService } from "@/server/services/edition-service";

// The Daily Squawk archive — "the morgue".
//
// Server component. Lists every edition across every board (most recent
// first) with the masthead chrome around the listing so the entry point
// reads as a real broadsheet archive rather than a generic table view.
//
// Empty state and chrome strings are frozen per the card spec.

export const metadata: Metadata = {
	title: "The Daily Squawk · The Morgue",
	description: "Past editions of The Daily Squawk, the broadsheet of record for the coop.",
};

const ARCHIVE_HEADER =
	"Where past editions are filed, foxed at the edges, and waiting to be cited.";

const EMPTY_STATE_HEAD = "THE PRESSES ARE WARM.";
const EMPTY_STATE_BODY =
	"No edition has gone to print. Ship a card, close a blocker, or save a handoff and tomorrow's morning paper writes itself.";
const EMPTY_STATE_SIGN = "— The Editors";

export default async function SquawkArchivePage() {
	const result = await editionService.listEditions(undefined, 100);
	const editions = result.success ? result.data : [];

	return (
		<div className="min-h-dvh bg-newsprint text-ink">
			<div className="mx-auto w-full max-w-[1100px] px-4 py-10 md:px-10 md:py-14">
				<div className="border-b-2 border-double border-ink pb-2 text-ticker-row">
					<span>The Morgue · Browse the Archive</span>
				</div>
				<header className="mt-4 mb-8 text-center">
					<h1 className="text-nameplate text-5xl leading-none md:text-7xl lg:text-8xl">
						The Daily Squawk
					</h1>
					<p className="text-byline mt-1">Paper of Record for the Coop · Est. MMXXVI</p>
				</header>

				<section>
					<h2 className="text-h2-section mb-2">
						<span className="text-nameplate">THE MORGUE</span>
					</h2>
					<p className="text-body-newspaper italic text-ink/70 mb-6">{ARCHIVE_HEADER}</p>

					{editions.length === 0 ? (
						<div className="border-2 border-dashed border-ink/40 p-8 text-center">
							<p className="text-h2-section mb-2 inline-block border-none">{EMPTY_STATE_HEAD}</p>
							<p className="text-body-newspaper text-ink/80">{EMPTY_STATE_BODY}</p>
							<p className="text-byline mt-3">{EMPTY_STATE_SIGN}</p>
						</div>
					) : (
						<ul className="divide-y divide-ink/30 border-y border-ink">
							{editions.map((edition) => {
								const date = new Date(edition.periodEnd);
								const dateLabel = date.toLocaleDateString(undefined, {
									year: "numeric",
									month: "long",
									day: "numeric",
								});
								return (
									<li key={edition.id} className="py-3">
										<Link
											href={`/squawk/${edition.id}`}
											className="group flex flex-col gap-1 md:flex-row md:items-baseline md:justify-between"
										>
											<span className="text-h2-section border-none">
												<span className="text-ticker-row mr-3 text-ink/70">
													Vol. {edition.masthead.volume}, No. {edition.masthead.issue}
												</span>
												<span className="group-hover:underline group-hover:decoration-squawk-accent">
													{dateLabel}
												</span>
											</span>
											<span className="text-byline text-ink/60">
												Filed {edition.generatedAt.toLocaleDateString()} →
											</span>
										</Link>
									</li>
								);
							})}
						</ul>
					)}
				</section>

				<footer className="mt-10 border-t-2 border-double border-ink pt-3 text-byline text-ink/70">
					All headlines fictional unless otherwise noted. All complaints to the pigeons. Set in
					Playfair, Source Serif &amp; Oswald. Printed on recycled context. © The Daily Squawk —
					paper of record for a coop of one.
				</footer>
			</div>
		</div>
	);
}
