import type { Metadata } from "next";
import Link from "next/link";

import { NewspaperShell } from "@/components/squawk/newspaper-shell";
import { SectionRenderer } from "@/components/squawk/section-renderer";
import { editionService } from "@/server/services/edition-service";

// Single-edition reader for The Daily Squawk.
//
// Server component. Loads the edition by id, renders the newspaper
// chrome, and feeds the markdown to the section renderer. Renders the
// frozen 404 string when the edition is missing instead of using
// notFound() — the broadsheet voice should survive even on a bad URL.

const NOT_FOUND_HEAD = "STOP THE PRESSES.";
const NOT_FOUND_BODY =
	"This edition has been pulled. Either it never went to print, or the morgue clerk has misfiled it. The newsroom regrets the error.";

type RouteParams = { editionId: string };

export async function generateMetadata({
	params,
}: {
	params: Promise<RouteParams>;
}): Promise<Metadata> {
	const { editionId } = await params;
	const result = await editionService.getEdition(editionId);
	if (!result.success || !result.data) {
		return { title: "Edition not found · The Daily Squawk" };
	}
	const edition = result.data;
	const date = new Date(edition.periodEnd).toLocaleDateString(undefined, {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
	return {
		title: `Vol. ${edition.masthead.volume}, No. ${edition.masthead.issue} · ${date} · The Daily Squawk`,
		description: "The Daily Squawk — newspaper-style activity digest for your kanban board.",
	};
}

export default async function SquawkEditionPage({ params }: { params: Promise<RouteParams> }) {
	const { editionId } = await params;
	const result = await editionService.getEdition(editionId);
	const edition = result.success ? result.data : null;

	if (!edition) {
		return (
			<div className="min-h-dvh bg-newsprint text-ink">
				<div className="mx-auto w-full max-w-[760px] px-4 py-16 text-center md:px-10">
					<header className="mb-6 border-b-4 border-double border-ink pb-4">
						<h1 className="text-nameplate text-5xl leading-none md:text-7xl">The Daily Squawk</h1>
						<p className="text-byline mt-1">Paper of Record for the Coop · Est. MMXXVI</p>
					</header>
					<h2 className="text-h2-section mb-3 inline-block border-none">{NOT_FOUND_HEAD}</h2>
					<p className="text-body-newspaper text-ink/80">{NOT_FOUND_BODY}</p>
					<p className="text-byline mt-6">
						<Link
							href="/squawk"
							className="underline decoration-ink/40 hover:decoration-squawk-accent"
						>
							Browse the morgue →
						</Link>
					</p>
				</div>
			</div>
		);
	}

	const date = new Date(edition.periodEnd).toLocaleDateString(undefined, {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
	});

	return (
		<>
			<NewspaperShell
				masthead={{
					editorName: edition.masthead.editorName,
					volume: edition.masthead.volume,
					issue: edition.masthead.issue,
					date,
					edition: "Late Edition",
				}}
			>
				<SectionRenderer content={edition.content} />
			</NewspaperShell>
			<div className="bg-newsprint text-ink pb-8">
				<div className="mx-auto w-full max-w-[1100px] px-4 text-center md:px-10">
					<Link
						href="/squawk"
						className="text-byline underline decoration-ink/40 hover:decoration-squawk-accent"
					>
						Browse the morgue →
					</Link>
				</div>
			</div>
		</>
	);
}
