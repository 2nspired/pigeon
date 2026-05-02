/**
 * Attribution Engine — pure function that picks one card per session for a
 * `recordTokenUsage` write, using only signals already present in the
 * session. Cluster head for the v6.3 charter (#267).
 *
 * Load-bearing constraint (from #267 triage, 2026-05-02): the
 * `TokenUsageEvent` row model is keyed `(sessionId, model)` with one
 * optional `cardId` (`src/lib/services/token-usage.ts:514, 656`). The
 * dominant write path (Stop hook → `recordFromTranscript`) aggregates a
 * whole session into one row per model. Per-call attribution within a
 * session isn't possible without reshaping the row model and every
 * aggregation in the Costs UI. v6.3 accepts this constraint: pick one
 * card per *session*, conservatively. Multi-card sessions classify as
 * `unattributed` by design — wrong > empty.
 *
 * Heuristic order (decreasing confidence), session-scoped:
 *   1. Explicit `cardId` in input               → high,       `explicit`
 *   2. Single In-Progress card on active board  → high,       `single-in-progress`
 *   3. Most-recently-touched card in *session*  → medium,     `session-recent-touch`
 *   4. Most-recent commit-link from session     → medium-low, `session-commit`
 *   5. Multi-card In-Progress *or* no signal    → null,       `unattributed`
 *
 * Multi-In-Progress short-circuits to `unattributed` even when (3) and (4)
 * would otherwise fire — that's the orchestrator-mode correctness gate
 * from #267's acceptance: ≥2 In-Progress cards on the active board mean
 * the session is doing orchestration, not card-focused work.
 *
 * Pure: no Prisma access, no IO. Cluster 2 (#269) builds the snapshot from
 * the live DB and wires this function into `recordTokenUsage`'s write
 * path. Cluster 3 (#270) reuses the same function inside a backfill script
 * over historical rows.
 */

export type AttributionConfidence = "high" | "medium" | "medium-low";

export type AttributionSignal =
	| "explicit"
	| "single-in-progress"
	| "session-recent-touch"
	| "session-commit"
	| "unattributed";

export type AttributionInput = {
	/** Caller-supplied card UUID. When set, always wins (signal=`explicit`). */
	cardId?: string | null;
};

export type SessionTouchedCard = {
	cardId: string;
	touchedAt: Date;
};

export type SessionCommitLink = {
	cardId: string;
	commitDate: Date;
};

export type AttributionStateSnapshot = {
	/**
	 * Cards in any column with `role: "active"` on the project's active board(s).
	 * The caller resolves this — keeping the snapshot pre-computed lets the
	 * function stay pure and the test surface narrow.
	 */
	inProgressCardIds: readonly string[];
	/**
	 * Cards touched (moved, updated, commented) in *this MCP session*, not by
	 * the agent globally. Order is irrelevant — the function picks the most
	 * recent by `touchedAt`.
	 */
	sessionTouchedCards: readonly SessionTouchedCard[];
	/**
	 * Commits linked to cards from this session's worktree. Order is
	 * irrelevant — the function picks the most recent by `commitDate`.
	 */
	sessionCommits: readonly SessionCommitLink[];
};

export type AttributionResult = {
	cardId: string | null;
	confidence: AttributionConfidence | null;
	signal: AttributionSignal;
};

const UNATTRIBUTED: AttributionResult = {
	cardId: null,
	confidence: null,
	signal: "unattributed",
};

export function attribute(
	input: AttributionInput,
	snapshot: AttributionStateSnapshot
): AttributionResult {
	// 1. Explicit cardId always wins — even when multi-In-Progress would
	//    otherwise short-circuit to unattributed. The agent is asserting
	//    "this work goes here"; we trust that over inferred state.
	if (input.cardId) {
		return { cardId: input.cardId, confidence: "high", signal: "explicit" };
	}

	const inProgress = snapshot.inProgressCardIds;

	// 2. Single In-Progress on the active board → high.
	if (inProgress.length === 1) {
		return { cardId: inProgress[0], confidence: "high", signal: "single-in-progress" };
	}

	// 5a. Multi-In-Progress short-circuits — orchestrator-mode gate. Do NOT
	//     fall through to session-touch or commit signals; the human pinned
	//     multiple cards to convey "this is multi-card work, don't guess."
	if (inProgress.length > 1) {
		return UNATTRIBUTED;
	}

	// 3. Most-recently-touched card in this session → medium.
	const recentTouch = pickMostRecent(snapshot.sessionTouchedCards, (t) => t.touchedAt);
	if (recentTouch) {
		return { cardId: recentTouch.cardId, confidence: "medium", signal: "session-recent-touch" };
	}

	// 4. Most-recent commit-link from this session → medium-low.
	const recentCommit = pickMostRecent(snapshot.sessionCommits, (c) => c.commitDate);
	if (recentCommit) {
		return { cardId: recentCommit.cardId, confidence: "medium-low", signal: "session-commit" };
	}

	// 5b. No signal.
	return UNATTRIBUTED;
}

function pickMostRecent<T>(items: readonly T[], at: (t: T) => Date): T | null {
	if (items.length === 0) return null;
	let best = items[0];
	for (let i = 1; i < items.length; i++) {
		if (at(items[i]).getTime() > at(best).getTime()) best = items[i];
	}
	return best;
}
