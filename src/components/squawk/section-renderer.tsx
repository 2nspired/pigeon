/**
 * SectionRenderer — splits a Daily Squawk markdown issue into the 11
 * sections, classifies each by its byline persona, and renders each one
 * inside its per-section frame on the 12-col newspaper grid.
 *
 * The agent emits one big markdown blob with `## Heading` + an italicized
 * `*By PersonaName*` byline on the next line. We split on `## ` to bucket
 * blocks, look up the byline, and pick the matching frame variant
 * (column span, divider rule, drop-cap, classifieds mono, etc.).
 *
 * Crossword stub: a fenced \`\`\`crossword block at the bottom is rendered
 * as a 4×4 SVG with the clue lines plotted next to it.
 */

import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

// ─── Section taxonomy ─────────────────────────────────────────────

type SectionKind =
	| "front-page"
	| "roost-report"
	| "blocker-beat"
	| "letters"
	| "local-interest"
	| "obituaries"
	| "classifieds"
	| "financial"
	| "sports"
	| "pigeon-post"
	| "corrections"
	| "unknown";

type Section = {
	kind: SectionKind;
	title: string;
	byline: string | null;
	body: string;
};

// Map persona → section kind. Used to classify each parsed section.
// Two personas share Coo-Coo Carmichael; we disambiguate by title text.
const BYLINE_TO_KIND: Record<string, SectionKind> = {
	"Edith Featherstone": "front-page",
	"Reginald Plumage III": "roost-report",
	"Marge Pebble": "blocker-beat",
	"Coo-Coo Carmichael": "letters",
	"Penelope Brittlewing": "local-interest",
	"Mort Cobblestone": "obituaries",
	"Mavis Doolittle": "classifieds",
	"Sterling Goldfeather": "financial",
	"Buck Wingfield": "sports",
};

// ─── Markdown parsing (pure) ──────────────────────────────────────

const BYLINE_RE = /^\*By\s+(.+?)\*\s*$/m;
const CROSSWORD_RE = /```crossword\n([\s\S]*?)```/;

/**
 * Split a Daily Squawk markdown issue into ordered sections. Pure —
 * no DOM. Each section starts at a `## ` heading and ends at the next
 * `## ` heading or end of input. The optional byline is the first
 * `*By NAME*` line inside the section body.
 */
export function parseIssue(content: string): { sections: Section[]; crossword: string | null } {
	const crosswordMatch = CROSSWORD_RE.exec(content);
	const crossword = crosswordMatch ? crosswordMatch[1].trim() : null;
	const stripped = crossword ? content.replace(CROSSWORD_RE, "") : content;

	const lines = stripped.split("\n");
	const sections: Section[] = [];
	let current: { title: string; bodyLines: string[] } | null = null;

	for (const line of lines) {
		const headingMatch = /^##\s+(.+?)\s*$/.exec(line);
		if (headingMatch) {
			if (current) {
				sections.push(buildSection(current.title, current.bodyLines));
			}
			current = { title: headingMatch[1], bodyLines: [] };
			continue;
		}
		if (current) {
			current.bodyLines.push(line);
		}
	}
	if (current) {
		sections.push(buildSection(current.title, current.bodyLines));
	}

	return { sections, crossword };
}

function buildSection(title: string, bodyLines: string[]): Section {
	const body = bodyLines.join("\n").trim();
	const bylineMatch = BYLINE_RE.exec(body);
	const byline = bylineMatch ? bylineMatch[1].trim() : null;

	// Strip the byline line out of the body; we render it separately.
	const cleanedBody = byline ? body.replace(BYLINE_RE, "").trim() : body;

	const kind = classifySection(title, byline);
	return { kind, title, byline, body: cleanedBody };
}

function classifySection(title: string, byline: string | null): SectionKind {
	const lowerTitle = title.toLowerCase();
	if (lowerTitle.includes("correction")) return "corrections";
	if (lowerTitle.includes("pigeon post") || lowerTitle.includes("letter from the editor")) {
		return "pigeon-post";
	}
	if (byline && BYLINE_TO_KIND[byline]) return BYLINE_TO_KIND[byline];
	return "unknown";
}

// ─── Per-section frames ───────────────────────────────────────────

type FrameProps = {
	section: Section;
};

const FRAME_CLASSES: Record<SectionKind, string> = {
	"front-page": "md:col-span-12",
	"roost-report": "md:col-span-7",
	"blocker-beat": "md:col-span-5",
	letters: "md:col-span-6 border-l border-ink/30 md:pl-6",
	"local-interest": "md:col-span-6",
	obituaries: "md:col-span-5 border-t-2 border-double border-ink pt-3",
	classifieds: "md:col-span-7",
	financial: "md:col-span-12 border-y-2 border-double border-ink py-4",
	sports: "md:col-span-7",
	"pigeon-post": "md:col-span-5 border-l border-ink/30 md:pl-6",
	corrections: "md:col-span-12 border-t border-ink pt-3",
	unknown: "md:col-span-12",
};

function SectionFrame({ section }: FrameProps) {
	const isLede = section.kind === "front-page";
	return (
		<section className={FRAME_CLASSES[section.kind]}>
			<header className="mb-3">
				{isLede ? (
					<h2 className="text-h1-lede mb-1">{section.title}</h2>
				) : (
					<h2 className="text-h2-section mb-1">{section.title}</h2>
				)}
				{section.byline && <p className="text-byline text-ink/70">By {section.byline}</p>}
			</header>
			<div
				className={cx(
					sectionBodyBase,
					section.kind === "classifieds" && "text-classified-line space-y-1.5",
					section.kind === "financial" && "text-ticker-row",
					isLede && "drop-cap"
				)}
			>
				<ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
					{section.body}
				</ReactMarkdown>
			</div>
		</section>
	);
}

const sectionBodyBase = "text-body-newspaper text-ink";

function cx(...xs: Array<string | false | undefined>): string {
	return xs.filter(Boolean).join(" ");
}

// Tailwind-aware markdown component overrides — body text reads as a
// broadsheet column, not a tech-blog post. Kept generic so all sections
// share the same prose treatment.
const markdownComponents = {
	p: ({ children }: { children?: React.ReactNode }) => <p className="mb-3 last:mb-0">{children}</p>,
	h3: ({ children }: { children?: React.ReactNode }) => (
		<h3 className="text-kicker mt-4 mb-1 text-ink/80">{children}</h3>
	),
	h4: ({ children }: { children?: React.ReactNode }) => (
		<h4 className="text-kicker mt-3 mb-1 text-ink/80">{children}</h4>
	),
	ul: ({ children }: { children?: React.ReactNode }) => (
		<ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0 marker:text-ink/60">{children}</ul>
	),
	ol: ({ children }: { children?: React.ReactNode }) => (
		<ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0 marker:text-ink/60">{children}</ol>
	),
	li: ({ children }: { children?: React.ReactNode }) => <li>{children}</li>,
	strong: ({ children }: { children?: React.ReactNode }) => (
		<strong className="font-bold text-ink">{children}</strong>
	),
	em: ({ children }: { children?: React.ReactNode }) => <em className="italic">{children}</em>,
	blockquote: ({ children }: { children?: React.ReactNode }) => (
		<blockquote className="mb-3 border-l-2 border-ink/40 pl-3 italic last:mb-0">
			{children}
		</blockquote>
	),
	hr: () => <hr className="my-3 border-ink/40" />,
	code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
		const isBlock = className?.includes("language-");
		if (isBlock) {
			return (
				<code className="block overflow-x-auto rounded border border-ink/20 bg-newsprint-tint p-2 text-xs">
					{children}
				</code>
			);
		}
		return <code className="rounded bg-newsprint-tint px-1 py-0.5 text-[0.85em]">{children}</code>;
	},
	pre: ({ children }: { children?: React.ReactNode }) => (
		<pre className="mb-3 last:mb-0">{children}</pre>
	),
	a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
		<a
			href={href}
			className="underline decoration-ink/40 underline-offset-2 hover:decoration-squawk-accent"
		>
			{children}
		</a>
	),
};

// ─── Crossword stub (4×4 SVG, three clues) ───────────────────────

export function CrosswordStub({ raw }: { raw: string | null }) {
	// Deterministic-but-decorative cell pattern for the 4×4 grid. Black
	// squares give a real crossword silhouette without needing a solver.
	const blackCells = new Set(["1,2", "2,0", "3,3"]);
	const numbers: Record<string, number> = {
		"0,0": 1,
		"0,2": 2,
		"2,1": 3,
	};

	const cells: Array<{ r: number; c: number; black: boolean; n?: number }> = [];
	for (let r = 0; r < 4; r++) {
		for (let c = 0; c < 4; c++) {
			const key = `${r},${c}`;
			cells.push({ r, c, black: blackCells.has(key), n: numbers[key] });
		}
	}

	const clueLines = (
		raw ?? "1. ACROSS — A new lede\n3. ACROSS — A spent dollar\n2. DOWN — A pigeon's prerogative"
	)
		.split("\n")
		.map((s) => s.trim())
		.filter(Boolean)
		.slice(0, 3);

	return (
		<aside className="md:col-span-4 border-t-2 border-double border-ink pt-3">
			<header className="mb-2">
				<h2 className="text-h2-section mb-1">Mini-Crossword</h2>
				<p className="text-byline text-ink/70">Compiled by The Editors</p>
			</header>
			<div className="flex items-start gap-4">
				<svg viewBox="0 0 80 80" className="h-32 w-32 shrink-0" aria-label="Mini crossword grid">
					<title>Mini crossword</title>
					{cells.map((cell) => {
						const x = cell.c * 20;
						const y = cell.r * 20;
						return (
							<g key={`${cell.r},${cell.c}`}>
								<rect
									x={x}
									y={y}
									width={20}
									height={20}
									fill={cell.black ? "var(--ink)" : "transparent"}
									stroke="var(--ink)"
									strokeWidth={1}
								/>
								{!cell.black && cell.n !== undefined && (
									<text
										x={x + 2}
										y={y + 7}
										fontSize={6}
										fontFamily="var(--font-kicker)"
										fill="var(--ink)"
									>
										{cell.n}
									</text>
								)}
							</g>
						);
					})}
				</svg>
				<ul className="text-classified-line text-ink space-y-1">
					{clueLines.map((line) => (
						<li key={line}>{line}</li>
					))}
				</ul>
			</div>
		</aside>
	);
}

// ─── Public renderer ──────────────────────────────────────────────

export function SectionRenderer({ content }: { content: string }) {
	const { sections, crossword } = parseIssue(content);

	// Render the front-page first (full-width lede), then the rest in
	// order with the crossword wedged after the front page so the eye
	// reads it before the long-form sections.
	const front = sections.find((s) => s.kind === "front-page");
	const rest = sections.filter((s) => s.kind !== "front-page");

	return (
		<>
			{front && <SectionFrame section={front} />}
			<CrosswordStub raw={crossword} />
			{rest.map((section, idx) => (
				<SectionFrame key={`${section.kind}-${idx}`} section={section} />
			))}
		</>
	);
}
