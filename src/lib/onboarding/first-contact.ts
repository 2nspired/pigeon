/**
 * First-contact teaching payload — agent-teaches onboarding (#315, v7 spec §5.2).
 *
 * When `briefMe` resolves a board that has never been worked — zero cards
 * AND zero handoffs — the MCP server returns this payload instead of the
 * normal session primer. It hands the connected agent (1) paradigm talking
 * points to paraphrase in its own voice (NOT a verbatim script) and (2) an
 * ordered narrative protocol to walk with the human's consent at each beat:
 * introduce the paradigm, scan the repo with the agent's own native tools
 * (Pigeon does not scan), propose first cards in chat, create them via
 * `bulkCreateCards`, demonstrate `planCard` live, and close on the
 * `saveHandoff` → next-session `briefMe` loop.
 *
 * The predicate is strict and stateless: once the first handoff is saved
 * (or any card exists) teaching never fires again — no flag column, no
 * migration, no half-teaching state for hand-seeded boards.
 *
 * Tool-call strings embedded here must be executable verbatim against the
 * post-#317 registry: `planCard` is ESSENTIAL (direct call, never via
 * `runTool`); `bulkCreateCards` is extended (via `runTool`). The unit test
 * in `src/mcp/__tests__/first-contact.test.ts` locks this in.
 *
 * Pure module: no tRPC, Next, or MCP-SDK imports (boundary-lint clean).
 */

import type { PrismaClient } from "prisma/generated/client";
import type { TrackerPolicy } from "../services/tracker-policy";

/**
 * Freshness predicate: true iff the board has zero cards and zero handoffs.
 * The moment either exists, first-contact teaching is permanently over for
 * this board.
 */
export async function isFirstContact(db: PrismaClient, boardId: string): Promise<boolean> {
	const [cardCount, handoffCount] = await Promise.all([
		db.card.count({ where: { column: { boardId } } }),
		db.handoff.count({ where: { boardId } }),
	]);
	return cardCount === 0 && handoffCount === 0;
}

export type FirstContactInput = {
	boardId: string;
	projectName: string;
	boardName: string;
	repoPath: string | null;
	policy: TrackerPolicy | null;
};

export type FirstContactStep = {
	step: number;
	do: string;
	call?: string;
	note?: string;
};

export type FirstContactPayload = {
	firstContact: true;
	board: { boardId: string; projectName: string; boardName: string; repoPath: string | null };
	positioning: string;
	paradigm: string[];
	voice: string;
	protocol: FirstContactStep[];
	policy?: { intentRequiredOn: string[]; prompt: string };
	_hint: string;
};

// Canonical positioning line — v7 spec §2, quoted once, verbatim.
const POSITIONING =
	"Pigeon is the visible workbench for AI-paired development. The card is the container: story, plan, comments, decisions, and cost live on the work itself.";

const POLICY_PROMPT_MAX = 400;

/**
 * Build the teaching payload for a fresh board. Kept deliberately lean —
 * the unit test asserts an estimated-token ceiling of ~800.
 */
export function buildFirstContactPayload(input: FirstContactInput): FirstContactPayload {
	const { boardId, projectName, boardName, repoPath, policy } = input;

	const protocol: FirstContactStep[] = [
		{
			step: 1,
			do: "Introduce the paradigm in 2-3 sentences, in your own words (draw on `paradigm` + `positioning`). Then ask: may I look around the repo and propose a first board?",
		},
		{
			step: 2,
			do: "With consent, scan the repo using YOUR OWN native tools — Pigeon does not scan; you do. Read the README, run `git log --oneline -20`, grep for TODO/FIXME.",
			note: "Keep it under a minute; you want real observed work, not a full audit.",
		},
		{
			step: 3,
			do: "Propose 4-8 first cards from what you actually observed — in chat first, as titles with one-line descriptions. Adjust until the human confirms.",
		},
		{
			step: 4,
			do: "On confirmation, create the cards in one call:",
			call: `runTool({ tool: 'bulkCreateCards', params: { boardId: '${boardId}', cards: [{ columnName: 'Backlog', title: '...', description: '...', priority: 'MEDIUM' }] } })`,
		},
		{
			step: 5,
			do: "Pick the meatiest card and demonstrate planning live:",
			call: `planCard({ boardId: '${boardId}', cardId: '#1' })`,
			note: "Walk the returned protocol: investigate, draft the four locked sections (Why now / Plan / Out of scope / Acceptance) in chat, then publish to the card with updateCard on confirmation. Chat is draft; card is publish.",
		},
		{
			step: 6,
			do: "Close the loop: explain that at session end you'll call saveHandoff({ summary, nextSteps }) — that handoff is exactly what the next session's briefMe opens with.",
		},
	];

	return {
		firstContact: true,
		board: { boardId, projectName, boardName, repoPath },
		positioning: POSITIONING,
		paradigm: [
			"Card as container: story, plan, comments, decisions, and cost live on the work item itself — no round-trips to external docs.",
			"The work is visible: the human sees what you believe on the board and corrects it right where they encounter it.",
			"The session loop: briefMe at start, work from cards, saveHandoff at end — continuity lives on the board, not in chat history.",
			"Agents scope to cards, not vague mega-tasks: pick one card, do it well, leave a trail.",
		],
		voice:
			"Paraphrase these points in your own voice — this is a conversation, not a script. Get the human's consent at each protocol beat before acting.",
		protocol,
		...(policy
			? {
					policy: {
						intentRequiredOn: policy.intent_required_on,
						prompt:
							policy.prompt.length > POLICY_PROMPT_MAX
								? `${policy.prompt.slice(0, POLICY_PROMPT_MAX)}…`
								: policy.prompt,
					},
				}
			: {}),
		_hint:
			"This board is brand new — teach first, then build. Normal briefMe payloads return once cards or a handoff exist.",
	};
}
