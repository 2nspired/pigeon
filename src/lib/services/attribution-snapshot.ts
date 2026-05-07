/**
 * Attribution snapshot builder (#269, extended in #272).
 *
 * Bridges the live Prisma state and the pure `attribute()` function in
 * `attribution.ts`. Called from `recordManual` and `recordFromTranscript`
 * before each attribution decision.
 *
 * Signals 1, 2, 5: `inProgressCardIds` is populated from cards in
 * `column.role = "active"` columns within this project. Multi-board
 * projects with one card pinned per board therefore count as
 * multi-In-Progress and correctly classify as `unattributed`
 * (orchestrator gate).
 *
 * Signals 3, 4 (#272): `sessionTouchedCards` and `sessionCommits` are
 * populated from `Activity` and `GitLink` rows scoped to
 * `sessionId = mcpSessionId AND createdAt > anchor`. Both fields stay
 * empty when `mcpSessionId` is null (web-side callers — no MCP session
 * concept) or when no `anchor` is supplied; in either case `attribute()`
 * falls through cleanly to signals 1+2+5.
 *
 * The session-scoped queries are gated on `mcpSessionId !== null` so the
 * web-side write path (Stop hook for browser-only Codex agents, future
 * tRPC `recordManual`) doesn't pay for an extra two queries when the
 * signals can't possibly fire.
 */

import type { PrismaClient } from "prisma/generated/client";
import type { AttributionStateSnapshot } from "@/lib/services/attribution";

export type BuildSnapshotOptions = {
	/**
	 * MCP server SESSION_ID. When set together with `sessionAnchor`, the
	 * builder loads recent same-session Activity / GitLink rows so
	 * signals 3 + 4 can fire. Pass null for web-side callers.
	 */
	mcpSessionId?: string | null;
	/**
	 * Inclusive lower bound for `createdAt` / `commitDate` on the
	 * session-scoped queries. Suggested values:
	 *   - `recordFromTranscript` → first transcript message timestamp.
	 *   - `recordManual`         → `now() - 4h`.
	 * Required alongside `mcpSessionId`; both empty arrays return when
	 * either is null.
	 */
	sessionAnchor?: Date | null;
};

export async function buildAttributionSnapshot(
	prisma: PrismaClient,
	projectId: string,
	options: BuildSnapshotOptions = {}
): Promise<AttributionStateSnapshot> {
	const { mcpSessionId, sessionAnchor } = options;
	const sessionScopeActive = !!mcpSessionId && !!sessionAnchor;

	// One Prisma round-trip per non-null signal — the in-progress lookup
	// always runs, the two session-scoped queries only when both
	// `mcpSessionId` and `sessionAnchor` are present.
	const inProgressCardsPromise = prisma.card.findMany({
		where: { projectId, column: { role: "active" } },
		select: { id: true },
	});

	const sessionActivitiesPromise = sessionScopeActive
		? prisma.activity.findMany({
				where: {
					sessionId: mcpSessionId as string,
					createdAt: { gt: sessionAnchor as Date },
					card: { projectId },
				},
				select: { cardId: true, createdAt: true },
			})
		: Promise.resolve([]);

	const sessionGitLinksPromise = sessionScopeActive
		? prisma.gitLink.findMany({
				where: {
					projectId,
					sessionId: mcpSessionId as string,
					commitDate: { gt: sessionAnchor as Date },
				},
				select: { cardId: true, commitDate: true },
			})
		: Promise.resolve([]);

	const [inProgressCards, sessionActivities, sessionGitLinks] = await Promise.all([
		inProgressCardsPromise,
		sessionActivitiesPromise,
		sessionGitLinksPromise,
	]);

	return {
		inProgressCardIds: inProgressCards.map((c) => c.id),
		sessionTouchedCards: sessionActivities.map((a) => ({
			cardId: a.cardId,
			touchedAt: a.createdAt,
		})),
		sessionCommits: sessionGitLinks.map((g) => ({
			cardId: g.cardId,
			commitDate: g.commitDate,
		})),
	};
}
