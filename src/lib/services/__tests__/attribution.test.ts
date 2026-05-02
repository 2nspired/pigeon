// @vitest-environment node
/**
 * Tests for the Attribution Engine (#268).
 *
 * Pure function — no Prisma, no IO. Each test hand-builds the input +
 * snapshot and asserts the returned `{ cardId, confidence, signal }`.
 *
 * Behavior reference: `src/lib/services/attribution.ts`. The
 * orchestrator-mode acceptance gate from #267 (multi-In-Progress must
 * classify as `unattributed`, never silently misattribute) is pinned by
 * the "multi-In-Progress" + "explicit overrides multi-In-Progress" cases.
 */

import { describe, expect, it } from "vitest";
import { type AttributionStateSnapshot, attribute } from "@/lib/services/attribution";

const NOW = new Date("2026-05-02T12:00:00Z");
const MIN = 60 * 1000;

function emptySnapshot(): AttributionStateSnapshot {
	return {
		inProgressCardIds: [],
		sessionTouchedCards: [],
		sessionCommits: [],
	};
}

// ─── Signal 1: explicit ────────────────────────────────────────────

describe("attribute — signal=explicit", () => {
	it("returns high confidence for an explicit cardId, even with no other signals", () => {
		const result = attribute({ cardId: "card-explicit" }, emptySnapshot());
		expect(result).toEqual({
			cardId: "card-explicit",
			confidence: "high",
			signal: "explicit",
		});
	});

	it("explicit cardId overrides multi-In-Progress (agent assertion beats inferred state)", () => {
		// Pins the "explicit always wins" rule. Without this, an orchestrator
		// agent that explicitly attributes a write to one card would have it
		// silently dropped by the multi-In-Progress short-circuit.
		const result = attribute(
			{ cardId: "card-explicit" },
			{
				...emptySnapshot(),
				inProgressCardIds: ["card-a", "card-b"],
			}
		);
		expect(result.cardId).toBe("card-explicit");
		expect(result.signal).toBe("explicit");
	});

	it("treats null cardId the same as omitted (falls through to other signals)", () => {
		const result = attribute(
			{ cardId: null },
			{ ...emptySnapshot(), inProgressCardIds: ["card-only"] }
		);
		expect(result.signal).toBe("single-in-progress");
		expect(result.cardId).toBe("card-only");
	});
});

// ─── Signal 2: single-in-progress ──────────────────────────────────

describe("attribute — signal=single-in-progress", () => {
	it("returns high confidence when exactly one card is in progress", () => {
		const result = attribute({}, { ...emptySnapshot(), inProgressCardIds: ["card-only"] });
		expect(result).toEqual({
			cardId: "card-only",
			confidence: "high",
			signal: "single-in-progress",
		});
	});

	it("single-In-Progress beats session-recent-touch (higher signal wins)", () => {
		const result = attribute(
			{},
			{
				inProgressCardIds: ["card-active"],
				sessionTouchedCards: [{ cardId: "card-touched", touchedAt: NOW }],
				sessionCommits: [],
			}
		);
		expect(result.cardId).toBe("card-active");
		expect(result.signal).toBe("single-in-progress");
	});
});

// ─── Signal 5 (orchestrator gate): multi-In-Progress → unattributed ─

describe("attribute — multi-In-Progress short-circuits to unattributed", () => {
	it("returns null/unattributed when ≥2 cards are in progress (orchestrator gate)", () => {
		// Orchestrator-mode acceptance gate from #267: ≥2 In-Progress means
		// the human pinned multiple cards on purpose. Wrong > empty.
		const result = attribute({}, { ...emptySnapshot(), inProgressCardIds: ["card-a", "card-b"] });
		expect(result).toEqual({
			cardId: null,
			confidence: null,
			signal: "unattributed",
		});
	});

	it("multi-In-Progress does NOT fall through to session-recent-touch", () => {
		// The whole point of the gate: a session that touched a single card
		// recently could still be doing orchestration if multiple cards are
		// In-Progress. Trust the In-Progress pin, not the touch history.
		const result = attribute(
			{},
			{
				inProgressCardIds: ["card-a", "card-b"],
				sessionTouchedCards: [{ cardId: "card-touched", touchedAt: NOW }],
				sessionCommits: [{ cardId: "card-committed", commitDate: NOW }],
			}
		);
		expect(result.signal).toBe("unattributed");
		expect(result.cardId).toBeNull();
	});
});

// ─── Signal 3: session-recent-touch ────────────────────────────────

describe("attribute — signal=session-recent-touch", () => {
	it("returns medium confidence when no In-Progress and one session touch", () => {
		const result = attribute(
			{},
			{
				...emptySnapshot(),
				sessionTouchedCards: [{ cardId: "card-touched", touchedAt: NOW }],
			}
		);
		expect(result).toEqual({
			cardId: "card-touched",
			confidence: "medium",
			signal: "session-recent-touch",
		});
	});

	it("picks the MOST RECENT touch when multiple session touches exist", () => {
		// Pins the picker — caller doesn't need to pre-sort. Defensive against
		// either Prisma orderBy direction.
		const result = attribute(
			{},
			{
				...emptySnapshot(),
				sessionTouchedCards: [
					{ cardId: "card-old", touchedAt: new Date(NOW.getTime() - 30 * MIN) },
					{ cardId: "card-newest", touchedAt: NOW },
					{ cardId: "card-mid", touchedAt: new Date(NOW.getTime() - 5 * MIN) },
				],
			}
		);
		expect(result.cardId).toBe("card-newest");
		expect(result.signal).toBe("session-recent-touch");
	});

	it("session-touch beats session-commit (medium > medium-low)", () => {
		const result = attribute(
			{},
			{
				inProgressCardIds: [],
				sessionTouchedCards: [{ cardId: "card-touched", touchedAt: NOW }],
				sessionCommits: [{ cardId: "card-committed", commitDate: NOW }],
			}
		);
		expect(result.cardId).toBe("card-touched");
		expect(result.signal).toBe("session-recent-touch");
	});
});

// ─── Signal 4: session-commit ──────────────────────────────────────

describe("attribute — signal=session-commit", () => {
	it("returns medium-low confidence when only commits exist", () => {
		const result = attribute(
			{},
			{
				...emptySnapshot(),
				sessionCommits: [{ cardId: "card-committed", commitDate: NOW }],
			}
		);
		expect(result).toEqual({
			cardId: "card-committed",
			confidence: "medium-low",
			signal: "session-commit",
		});
	});

	it("picks the MOST RECENT commit when multiple session commits exist", () => {
		const result = attribute(
			{},
			{
				...emptySnapshot(),
				sessionCommits: [
					{ cardId: "card-old", commitDate: new Date(NOW.getTime() - 60 * MIN) },
					{ cardId: "card-newest", commitDate: NOW },
				],
			}
		);
		expect(result.cardId).toBe("card-newest");
		expect(result.signal).toBe("session-commit");
	});
});

// ─── Signal 5 (no signal): unattributed ────────────────────────────

describe("attribute — signal=unattributed (no signal)", () => {
	it("returns null/unattributed when nothing matches", () => {
		const result = attribute({}, emptySnapshot());
		expect(result).toEqual({
			cardId: null,
			confidence: null,
			signal: "unattributed",
		});
	});

	it("returns unattributed when input cardId is the empty string (treat as missing)", () => {
		// Pins the truthy-check on `input.cardId`. Empty string is not a valid
		// UUID — let it fall through rather than emitting a high-confidence
		// attribution to a junk id.
		const result = attribute({ cardId: "" }, emptySnapshot());
		expect(result.signal).toBe("unattributed");
		expect(result.cardId).toBeNull();
	});
});
