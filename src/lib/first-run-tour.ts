/**
 * First-run tour — three dismissible beats on a just-seeded board
 * (#316, v7 spec §5.3, Slice 1 "First Contact").
 *
 * Audience: the person watching the web UI while their agent works. The
 * agent-side half of first contact is `src/lib/onboarding/first-contact.ts`
 * (#315) — the agent seeds the board and plans a card live. This module is
 * the human-side mirror: three coach marks anchored to the surfaces that
 * teach the paradigm — the agent-written plan on a card, the comment
 * composer ("comment here and the next session sees it"), and the Costs
 * link ("this is where you'll see what it cost").
 *
 * Arming: the tour only arms while the board is inside its first-run
 * window (`FIRST_RUN_WINDOW_DAYS` from `board.createdAt`) and at least one
 * beat is undismissed. No server state — dismissal is per-board
 * localStorage, matching the saved-views (`src/lib/board-views.ts`) and
 * upgrade-panel patterns. Once dismissed, a beat is never seen again.
 *
 * Pure module (plus localStorage access wrapped in try/catch): no tRPC,
 * Next, or MCP imports — boundary-lint clean, unit-testable in jsdom.
 */

export type TourBeatId = "agent-plan" | "comment-loop" | "cost";

export const ALL_TOUR_BEATS: readonly TourBeatId[] = ["agent-plan", "comment-loop", "cost"];

export type TourBeat = {
	step: number;
	title: string;
	body: string;
};

/**
 * Beat copy — v7 spec §5.3, quoted beats expanded in Pigeon's voice. The
 * explicit side-by-side-with-terminal suggestion lives on the comment-loop
 * beat: it's the beat about working alongside a live agent session.
 */
export const TOUR_BEATS: Record<TourBeatId, TourBeat> = {
	"agent-plan": {
		step: 1,
		title: "This plan was written by your agent",
		body: "The sections below — Why now, Plan, Out of scope, Acceptance — came out of planCard. Edit anything that reads wrong: the card, not the chat, is the shared source of truth.",
	},
	"comment-loop": {
		step: 2,
		title: "Comment here — the next session sees it",
		body: "Notes you leave on a card land in your agent's brief when the next session opens this board. Pigeon works best side-by-side with your terminal: keep the board next to your agent and comment while it works.",
	},
	cost: {
		step: 3,
		title: "This is where you'll see what it cost",
		body: "Token spend rolls up per session, per card, and per project — every piece of work carries a price tag for what it took to build.",
	},
};

/** Days after board creation during which the tour can still arm. */
export const FIRST_RUN_WINDOW_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * True while the board is young enough for the tour to arm. Accepts the
 * serialized string form too — tRPC/superjson hands components a Date, but
 * tests and any JSON-shaped caller shouldn't have to care.
 */
export function isWithinFirstRunWindow(
	boardCreatedAt: Date | string,
	now: Date = new Date()
): boolean {
	const created = typeof boardCreatedAt === "string" ? new Date(boardCreatedAt) : boardCreatedAt;
	const age = now.getTime() - created.getTime();
	if (Number.isNaN(age)) return false;
	// Clock skew / imported data can put createdAt slightly in the future —
	// treat that as "brand new", not "outside the window".
	return age < FIRST_RUN_WINDOW_DAYS * DAY_MS;
}

/**
 * Detects a planCard-authored description: the four plan sections are
 * locked headings, so `## Why now` and `## Plan` at line start are the
 * stable signal that an agent published this plan (see planCard protocol).
 */
export function hasAgentPlan(description: string | null | undefined): boolean {
	if (!description) return false;
	return /^## Why now\s*$/m.test(description) && /^## Plan\s*$/m.test(description);
}

function storageKey(boardId: string): string {
	return `pigeon:first-run-tour:${boardId}`;
}

function isTourBeatId(value: unknown): value is TourBeatId {
	return typeof value === "string" && (ALL_TOUR_BEATS as readonly string[]).includes(value);
}

/** Dismissed beat ids for a board. Corrupt/absent storage reads as none. */
export function loadDismissedBeats(boardId: string): TourBeatId[] {
	try {
		const raw = window.localStorage.getItem(storageKey(boardId));
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(isTourBeatId);
	} catch {
		// Private mode / disabled storage / corrupt JSON — treat as never-dismissed.
		return [];
	}
}

/** Persist dismissed beats. Degrades silently when storage is unavailable. */
export function saveDismissedBeats(boardId: string, beats: readonly TourBeatId[]): void {
	try {
		window.localStorage.setItem(storageKey(boardId), JSON.stringify(Array.from(new Set(beats))));
	} catch {
		// no-op — the tour just re-arms next visit.
	}
}
