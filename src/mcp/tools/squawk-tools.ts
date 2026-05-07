/**
 * The Daily Squawk — MCP tools (#298).
 *
 * Three extended tools, mirroring the planCard / saveHandoff workflow:
 *
 *   - `squawk` (write — auto-stamps activity for the editor desk):
 *       Workflow orchestrator. Resolves period, loads activity window,
 *       composes the masthead, and returns the editor system prompt +
 *       the section protocol the agent follows to draft an issue.
 *
 *   - `getActivityWindow` (read-only):
 *       Re-fetch the same activity payload without the protocol — for
 *       agents that already have a draft and want fresh data.
 *
 *   - `publishEdition` (write):
 *       Persist the markdown the agent wrote. Slug collision returns the
 *       existing edition's URL — editions are immutable per the plan.
 *
 * The editor roster, system prompt, and chrome strings are hardcoded —
 * they're product identity, not per-project configuration. v1 has no
 * tracker.md override hook.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { createEditionService, type Masthead } from "@/lib/services/edition";
import { db } from "../db.js";
import { registerExtendedTool } from "../tool-registry.js";
import { AGENT_NAME, err, getProjectIdForBoard, ok, safeExecute } from "../utils.js";

const execFileAsync = promisify(execFile);

// Bind the shared factory to MCP's PrismaClient. Singleton — same shape
// as the web shim but pointed at the MCP db.
const editionService = createEditionService(db);

// ─── Editorial roster (frozen) ────────────────────────────────────

export const MASTHEAD_ROSTER = {
	editorInChief: "Edith Featherstone",
	roster: [
		{ section: "Front Page lede + Weather", byline: "Edith Featherstone" },
		{ section: "The Roost Report (shipped) + Work in Progress", byline: "Reginald Plumage III" },
		{ section: "The Blocker Beat", byline: "Marge Pebble" },
		{ section: "Letters to the Editor", byline: "Coo-Coo Carmichael" },
		{ section: "Local Interest (PURE FICTION)", byline: "Penelope Brittlewing" },
		{ section: "Obituaries", byline: "Mort Cobblestone" },
		{ section: "Classifieds", byline: "Mavis Doolittle" },
		{ section: "Financial Pages", byline: "Sterling Goldfeather" },
		{ section: "Sports", byline: "Buck Wingfield" },
		{ section: "The Pigeon Post (Letter from the Editor)", byline: "Coo-Coo Carmichael" },
		{ section: "Corrections & Amplifications", byline: "Edith Featherstone" },
	],
} as const;

// ─── Editor system prompt (~200 words, dry deadpan voice) ─────────

export const EDITOR_SYSTEM_PROMPT = `You are Edith Featherstone, Editor-in-Chief of The Daily Squawk, a broadsheet of record for software development teams. Your voice is dry, authoritative, and deliberately deadpan — the prose of a 1920s metropolitan newspaper applied without irony to pull requests and Prisma migrations.

BYLINE ASSIGNMENTS. Each section carries exactly one byline. Bylines are personas, not usernames. Never use real names of developers, agents, or operators. The roster is fixed — see \`masthead.roster\`.

SECTION RULES.
- Local Interest must be entirely fictional — no board data, no card references, no real project names. Penelope Brittlewing reports from a fictional borough of the coop.
- Obituaries: if no real deletions exist in \`activityWindow.gitLinksInPeriod\`, Mort Cobblestone invents a tasteful fictional passing of a long-running module that no one has touched in years.
- Financial Pages: Sterling Goldfeather must cite the actual \`byModel\` figures from \`activityWindow.financialData\` — no invented numbers. If the window has zero spend, say so plainly.
- Classifieds: Mavis Doolittle mixes real stale-backlog cards (reframed as want-ads, e.g. "WANTED: a champion for #142, 47 days in the cold storage") with no more than two invented ads.
- Weather: one sentence, board mood, poetic license permitted.
- Pigeon Post: Coo-Coo Carmichael's voice over the most recent saveHandoff (\`latestHandoff\`), framing it as a letter from the editor.
- Corrections: render only when \`corrections\` is non-empty. Format: "In Tuesday's edition, this paper reported #142 as shipped. The card has since been reopened. We regret the premature obituary."

FORMAT. Emit valid markdown. Each section opens with a level-2 heading and the byline on the next line as italicized text: \`*By Reginald Plumage III*\`. Keep it tight — a real newspaper page, not a blog post.`;

// ─── Section protocol (drives the agent's drafting workflow) ─────

const SECTION_PROTOCOL = `# Drafting today's edition

Write a markdown issue with all 11 sections in this order. Use the bylines from \`masthead.roster\`. Keep the tone dry, authoritative, and slightly anachronistic — broadsheet of record, not a tech blog.

## 1. Front Page

\`## Today's Front Page\`
*By Edith Featherstone*

A single lede paragraph (3–4 sentences) covering the period's most newsworthy event — the most-shipped card, the biggest blocker break, the costliest session. End with a one-sentence weather report.

## 2. The Roost Report

\`## The Roost Report\`
*By Reginald Plumage III*

Subsection: **Shipped**. List \`completedCards\` with brief commentary on each (one short paragraph per card max). Then a **Work in Progress** subsection covering \`inProgressCards\`.

## 3. The Blocker Beat

\`## The Blocker Beat\`
*By Marge Pebble*

Cover \`blockedCards\`. If empty, Marge files a short, smug paragraph noting the absence of trouble.

## 4. Letters to the Editor

\`## Letters to the Editor\`
*By Coo-Coo Carmichael*

Highlight 1–3 \`comments\` and 0–1 \`handoffs\` from the period. Quote sparingly. If both are empty, skip with a one-line "the inbox was quiet this week" filler.

## 5. Local Interest

\`## Local Interest\`
*By Penelope Brittlewing*

PURE FICTION. A neighborhood report from somewhere in the coop — a pigeon's missing umbrella, a meeting of the Allotment Committee. Zero board data.

## 6. Obituaries

\`## Obituaries\`
*By Mort Cobblestone*

Use \`gitLinksInPeriod\` (deletions) when present. Otherwise invent a tasteful passing of a fictional module. Use the ❦ ornament between entries.

## 7. Classifieds

\`## Classifieds\`
*By Mavis Doolittle*

Reframe \`staleBacklogCards\` as want-ads (e.g. "WANTED: a champion for #142, 47 days in cold storage"). Add no more than two invented ads.

## 8. Financial Pages

\`## Financial Pages\`
*By Sterling Goldfeather*

Cite \`financialData.byModel\` and \`totalCostUsd\` literally. Mention up to three \`topSpendingCards\`. No invented numbers.

## 9. Sports

\`## Sports\`
*By Buck Wingfield*

Lead with \`velocityStats.cardsCompleted\` (the score). Highlight the \`leadingScorerCard\` if present. Mention \`medianCycleTimeHours\`.

## 10. The Pigeon Post

\`## The Pigeon Post\`
*By Coo-Coo Carmichael*

A "Letter from the Editor" framing of \`latestHandoff\`. Quote \`summary\` once.

## 11. Corrections & Amplifications

\`## Corrections & Amplifications\`
*By Edith Featherstone*

Render only when \`corrections\` is non-empty. Otherwise omit the section entirely.

## Front-page mini-crossword (every issue)

End the markdown with a fenced code block containing 3 numbered clues drawn from this period's card titles. The web reader renders them next to the masthead. Format:

\`\`\`crossword
1. ACROSS — <clue derived from a card title>
3. ACROSS — <clue derived from a card title>
2. DOWN  — <clue derived from a card title>
\`\`\`

Doesn't need to be solvable — purely visual stub.

## Publishing

When the markdown is complete, call:

\`\`\`
runTool({
  tool: "publishEdition",
  params: {
    boardId: "<boardId>",
    content: "<the full markdown you wrote>",
    periodStart: "<periodStart from the activityWindow>",
    periodEnd: "<periodEnd from the activityWindow>",
    masthead: { editorName: "Edith Featherstone", volume: "<masthead.volume>", issue: <masthead.issue> }
  }
})
\`\`\`

Re-running publishEdition for the same day returns the existing URL — editions are immutable.`;

// ─── Period parsing ───────────────────────────────────────────────

export type ParsedPeriod = {
	periodStart: Date;
	periodEnd: Date;
	label: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Resolve a period string into a (start, end] window. Accepts:
 *   - undefined / "" → last 24h ending now
 *   - "1d" / "7d" / "30d" → trailing N-day window ending now
 *   - "YYYY-MM-DD/YYYY-MM-DD" → explicit range, both inclusive (00:00 → 23:59:59 UTC)
 */
export function resolvePeriod(input: string | undefined): ParsedPeriod {
	const now = new Date();
	if (!input || input.trim() === "") {
		return { periodStart: new Date(now.getTime() - DAY_MS), periodEnd: now, label: "last 24h" };
	}

	const trimmed = input.trim();
	const dayMatch = /^(\d+)d$/i.exec(trimmed);
	if (dayMatch) {
		const days = Math.max(1, Math.min(365, Number.parseInt(dayMatch[1], 10)));
		return {
			periodStart: new Date(now.getTime() - days * DAY_MS),
			periodEnd: now,
			label: `last ${days} day${days === 1 ? "" : "s"}`,
		};
	}

	const rangeMatch = /^(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$/.exec(trimmed);
	if (rangeMatch) {
		const start = new Date(`${rangeMatch[1]}T00:00:00Z`);
		const end = new Date(`${rangeMatch[2]}T23:59:59.999Z`);
		if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
			throw new Error(
				`Invalid period range "${trimmed}". Use YYYY-MM-DD/YYYY-MM-DD with end >= start.`
			);
		}
		return { periodStart: start, periodEnd: end, label: `${rangeMatch[1]} to ${rangeMatch[2]}` };
	}

	throw new Error(
		`Unrecognized period "${trimmed}". Accepts "1d" / "7d" / "30d" / "YYYY-MM-DD/YYYY-MM-DD".`
	);
}

// ─── Best-effort deletion detection ──────────────────────────────

/**
 * Run `git log --diff-filter=D --since=<periodStart> --until=<periodEnd>`
 * and return up to 20 deletion entries. Silenced on git error — Mort
 * falls back to fiction in that case.
 */
export async function detectDeletions(
	cwd: string | undefined,
	periodStart: Date,
	periodEnd: Date
): Promise<Array<{ commitHash: string; commitDate: string; author: string; filePath: string }>> {
	if (!cwd) return [];
	try {
		const sinceIso = periodStart.toISOString();
		const untilIso = periodEnd.toISOString();
		const { stdout } = await execFileAsync(
			"git",
			[
				"log",
				"--diff-filter=D",
				"--name-only",
				`--since=${sinceIso}`,
				`--until=${untilIso}`,
				"--pretty=format:|||%H|||%ad|||%an",
				"--date=iso-strict",
			],
			{ cwd, timeout: 5000, maxBuffer: 4 * 1024 * 1024 }
		);
		const out: Array<{
			commitHash: string;
			commitDate: string;
			author: string;
			filePath: string;
		}> = [];
		const lines = stdout.split("\n");
		let current: { commitHash: string; commitDate: string; author: string } | null = null;
		for (const raw of lines) {
			const line = raw.trim();
			if (!line) continue;
			if (line.startsWith("|||")) {
				const parts = line.split("|||").filter(Boolean);
				if (parts.length >= 3) {
					current = { commitHash: parts[0], commitDate: parts[1], author: parts[2] };
				}
				continue;
			}
			if (current) {
				out.push({ ...current, filePath: line });
				if (out.length >= 20) break;
			}
		}
		return out;
	} catch {
		return [];
	}
}

// ─── Tool registration ────────────────────────────────────────────

const periodSchema = z
	.string()
	.optional()
	.describe(
		'Optional timeframe: "1d" / "7d" / "30d" / "YYYY-MM-DD/YYYY-MM-DD". Defaults to last 24h.'
	);

registerExtendedTool("squawk", {
	category: "context",
	description:
		"The Daily Squawk: returns activity data + masthead + editor system prompt + section protocol so the agent can draft a newspaper-style digest. Call publishEdition once the markdown is complete.",
	parameters: z.object({
		boardId: z.string().describe("Board UUID — pass explicitly when in a worktree."),
		period: periodSchema,
		intent: z
			.string()
			.max(120)
			.optional()
			.describe("Optional rationale stamped on the activity log (e.g. 'sunday paper')."),
	}),
	handler: (params) =>
		safeExecute(async () => {
			const p = params as { boardId: string; period?: string; intent?: string };

			const projectId = await getProjectIdForBoard(p.boardId);
			if (!projectId) {
				return err(
					`Board ${p.boardId} not found.`,
					"Pass a valid boardId — call checkOnboarding to list boards."
				);
			}

			let period: ParsedPeriod;
			try {
				period = resolvePeriod(p.period);
			} catch (e) {
				return err(e instanceof Error ? e.message : String(e));
			}

			const activityResult = await editionService.getActivityWindow(
				p.boardId,
				projectId,
				period.periodStart,
				period.periodEnd
			);
			if (!activityResult.success) {
				return err(activityResult.error.message);
			}

			// Best-effort deletions inline. Silenced on git error.
			const deletions = await detectDeletions(
				process.env.MCP_CALLER_CWD ?? process.cwd(),
				period.periodStart,
				period.periodEnd
			);

			// Hydrate deletions with card refs by best-effort GitLink lookup —
			// not all deleted files have a card binding; entries without one
			// stay attached to a `cardNumber: 0` so Mort can still mention them
			// generically. Cheap query (deletions are bounded to 20).
			const gitLinksInPeriod = await Promise.all(
				deletions.map(async (d) => {
					const link = await db.gitLink.findFirst({
						where: { commitHash: d.commitHash, projectId },
						select: { card: { select: { number: true, title: true } } },
					});
					return {
						commitHash: d.commitHash,
						commitDate: new Date(d.commitDate),
						author: d.author,
						filePath: d.filePath,
						cardNumber: link?.card.number ?? 0,
						cardTitle: link?.card.title ?? "",
					};
				})
			);

			// Compose the masthead.
			const issueNum = await editionService.nextIssueNumber(p.boardId);
			const { volumeForIssue } = await import("@/lib/services/edition");
			const masthead = {
				editorName: MASTHEAD_ROSTER.editorInChief,
				volume: volumeForIssue(issueNum),
				issue: issueNum,
				slogan: "Paper of Record for the Coop · Est. MMXXVI",
				date: formatLongDate(period.periodEnd),
				edition: "Late Edition",
				roster: MASTHEAD_ROSTER.roster,
			};

			// Stamp activity (the editor-on-deck signal). Mirrors planCard.
			try {
				const board = await db.board.findUnique({
					where: { id: p.boardId },
					select: { columns: { select: { id: true }, take: 1 } },
				});
				// Activity rows attach to a card, not a board; if there are no
				// cards on the board (cold install), skip silently.
				const someCard = await db.card.findFirst({
					where: { column: { boardId: p.boardId } },
					select: { id: true },
				});
				if (someCard) {
					await db.activity.create({
						data: {
							cardId: someCard.id,
							action: "squawk",
							details: `Drafting Daily Squawk for ${period.label}`,
							intent: p.intent
								? `squawk: ${p.intent}`
								: `squawk: drafting edition for ${period.label}`,
							actorType: "AGENT",
							actorName: AGENT_NAME,
						},
					});
				}
				// `board` lookup is decorative — keep it referenced so the
				// linter doesn't strip it; future enhancements may need columns.
				void board;
			} catch {
				// Activity stamping is observational; never block the editor.
			}

			return ok({
				period: {
					periodStart: period.periodStart.toISOString(),
					periodEnd: period.periodEnd.toISOString(),
					label: period.label,
				},
				masthead,
				activityWindow: { ...activityResult.data, gitLinksInPeriod },
				editorSystemPrompt: EDITOR_SYSTEM_PROMPT,
				protocol: SECTION_PROTOCOL,
			});
		}),
});

registerExtendedTool("getActivityWindow", {
	category: "context",
	description:
		"Read-only re-fetch of the Daily Squawk activity window (without the editor protocol). Useful for refreshing data while drafting an issue.",
	annotations: { readOnlyHint: true },
	parameters: z.object({
		boardId: z.string().describe("Board UUID."),
		periodStart: z.string().describe("ISO-8601 start of period."),
		periodEnd: z.string().describe("ISO-8601 end of period."),
	}),
	handler: (params) =>
		safeExecute(async () => {
			const p = params as { boardId: string; periodStart: string; periodEnd: string };
			const projectId = await getProjectIdForBoard(p.boardId);
			if (!projectId) {
				return err(`Board ${p.boardId} not found.`);
			}
			const start = new Date(p.periodStart);
			const end = new Date(p.periodEnd);
			if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
				return err("Invalid periodStart/periodEnd — must be ISO-8601 with end >= start.");
			}
			const result = await editionService.getActivityWindow(p.boardId, projectId, start, end);
			if (!result.success) return err(result.error.message);
			return ok(result.data);
		}),
});

registerExtendedTool("publishEdition", {
	category: "context",
	description:
		"Persist a drafted Daily Squawk markdown issue. Returns the URL. Editions are immutable — duplicate slug returns the existing edition's URL.",
	parameters: z.object({
		boardId: z.string().describe("Board UUID."),
		content: z.string().min(1).describe("Full markdown body of the issue."),
		periodStart: z.string().describe("ISO-8601 start of period (from squawk response)."),
		periodEnd: z.string().describe("ISO-8601 end of period (from squawk response)."),
		masthead: z
			.object({
				editorName: z.string(),
				volume: z.string(),
				issue: z.number().int().positive(),
			})
			.describe("Masthead meta (from squawk response)."),
		intent: z.string().max(120).optional().describe("Optional publish rationale."),
	}),
	handler: (params) =>
		safeExecute(async () => {
			const p = params as {
				boardId: string;
				content: string;
				periodStart: string;
				periodEnd: string;
				masthead: Masthead;
				intent?: string;
			};
			const start = new Date(p.periodStart);
			const end = new Date(p.periodEnd);
			if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
				return err("Invalid periodStart/periodEnd — must be ISO-8601.");
			}
			const result = await editionService.publishEdition({
				boardId: p.boardId,
				content: p.content,
				periodStart: start,
				periodEnd: end,
				masthead: p.masthead,
			});
			if (!result.success) return err(result.error.message);
			return ok(result.data);
		}),
});

// ─── Helpers (exported for tests) ────────────────────────────────

/** Long-form date for the masthead chrome: "Wednesday, May 6, 2026". */
export function formatLongDate(d: Date): string {
	const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
	const months = [
		"January",
		"February",
		"March",
		"April",
		"May",
		"June",
		"July",
		"August",
		"September",
		"October",
		"November",
		"December",
	];
	return `${days[d.getUTCDay()]}, ${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
