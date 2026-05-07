/**
 * NewspaperShell — masthead + 12-col grid + footer chrome.
 *
 * Pure layout primitive. Owns the newspaper page chrome (masthead with
 * UnifrakturCook nameplate, edition strip with frozen Vol./No. format,
 * footer with the agreed copy) and renders its children inside the
 * 12-column grid that the per-section frames map onto. Children opt
 * into column spans via Tailwind utilities.
 */

import type { ReactNode } from "react";

export type Masthead = {
	editorName: string;
	volume: string;
	issue: number;
	slogan?: string;
	date?: string;
	edition?: string;
};

const SLOGAN = "Paper of Record for the Coop · Est. MMXXVI";
const FOOTER =
	"All headlines fictional unless otherwise noted. All complaints to the pigeons. Set in Playfair, Source Serif & Oswald. Printed on recycled context. © The Daily Squawk — paper of record for a coop of one.";

export function NewspaperShell({
	masthead,
	children,
}: {
	masthead: Masthead;
	children: ReactNode;
}) {
	const editionLabel = `Vol. ${masthead.volume}, No. ${masthead.issue}${
		masthead.date ? ` — ${masthead.date}` : ""
	}${masthead.edition ? ` · ${masthead.edition}` : ""}`;

	return (
		<article
			className="min-h-dvh w-full bg-newsprint text-ink"
			style={{
				backgroundImage:
					// Subtle paper grain via stacked radial-gradients — no image asset
					// needed. Renders identically light/dark since the surface is
					// always the cream newsprint colour.
					"radial-gradient(circle at 25% 30%, oklch(0.92 0.02 80 / 0.5) 0, transparent 18%), radial-gradient(circle at 75% 70%, oklch(0.92 0.02 80 / 0.4) 0, transparent 22%)",
			}}
		>
			<div className="mx-auto w-full max-w-[1100px] px-4 py-8 md:px-10 md:py-12">
				{/* ─── Edition strip (top rule) ─────────────────────────── */}
				<div className="flex items-center justify-between border-b-2 border-double border-ink pb-2 text-ticker-row">
					<span>{editionLabel}</span>
					<span className="flex items-center gap-2">
						<span
							className="inline-block h-2 w-2 rounded-full bg-squawk-accent"
							aria-hidden="true"
						/>
						Today&rsquo;s Edition
					</span>
				</div>

				{/* ─── Masthead nameplate ──────────────────────────────── */}
				<header className="mt-4 flex flex-col items-center gap-1 border-b-4 border-double border-ink pb-4 text-center">
					<h1 className="text-nameplate text-5xl leading-none md:text-7xl lg:text-8xl">
						The Daily Squawk
					</h1>
					<p className="text-byline">{SLOGAN}</p>
				</header>

				{/* ─── Body grid ───────────────────────────────────────── */}
				<div className="mt-8 grid grid-cols-1 gap-x-8 gap-y-10 md:grid-cols-12">{children}</div>

				{/* ─── Footer ──────────────────────────────────────────── */}
				<footer className="mt-12 border-t-2 border-double border-ink pt-4 text-byline text-ink/80">
					{FOOTER}
				</footer>
			</div>
		</article>
	);
}
