/**
 * First-run tour logic (#316) — arming window, agent-plan detection, and
 * localStorage dismissal round-trips. The rendering half lives in
 * `src/components/board/__tests__/first-run-tour.test.tsx`.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
	ALL_TOUR_BEATS,
	FIRST_RUN_WINDOW_DAYS,
	hasAgentPlan,
	isWithinFirstRunWindow,
	loadDismissedBeats,
	saveDismissedBeats,
	TOUR_BEATS,
} from "@/lib/first-run-tour";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-07-13T12:00:00Z");

describe("isWithinFirstRunWindow", () => {
	it("is true for a board created moments ago", () => {
		expect(isWithinFirstRunWindow(new Date(NOW.getTime() - 60_000), NOW)).toBe(true);
	});

	it("is true just inside the window and false at the boundary", () => {
		const justInside = new Date(NOW.getTime() - (FIRST_RUN_WINDOW_DAYS * DAY_MS - 1));
		const atBoundary = new Date(NOW.getTime() - FIRST_RUN_WINDOW_DAYS * DAY_MS);
		expect(isWithinFirstRunWindow(justInside, NOW)).toBe(true);
		expect(isWithinFirstRunWindow(atBoundary, NOW)).toBe(false);
	});

	it("is false for an old board", () => {
		expect(isWithinFirstRunWindow(new Date(NOW.getTime() - 90 * DAY_MS), NOW)).toBe(false);
	});

	it("accepts ISO-string input", () => {
		expect(isWithinFirstRunWindow("2026-07-12T12:00:00Z", NOW)).toBe(true);
		expect(isWithinFirstRunWindow("2026-01-01T00:00:00Z", NOW)).toBe(false);
	});

	it("treats a slightly-future createdAt as brand new, and garbage as outside", () => {
		expect(isWithinFirstRunWindow(new Date(NOW.getTime() + 60_000), NOW)).toBe(true);
		expect(isWithinFirstRunWindow("not-a-date", NOW)).toBe(false);
	});
});

describe("hasAgentPlan", () => {
	const planCardOutput = [
		"## Why now",
		"Adoption friction is the #1 complaint.",
		"",
		"## Plan",
		"1. Do the thing.",
		"",
		"## Out of scope",
		"Everything else.",
		"",
		"## Acceptance",
		"It works.",
	].join("\n");

	it("detects the locked planCard headings", () => {
		expect(hasAgentPlan(planCardOutput)).toBe(true);
	});

	it("requires both Why now and Plan headings", () => {
		expect(hasAgentPlan("## Why now\nreasons but no plan section")).toBe(false);
		expect(hasAgentPlan("## Plan\nsteps but no why-now section")).toBe(false);
	});

	it("ignores the headings when they are not at line start or wrong depth", () => {
		expect(hasAgentPlan("see ## Why now inline and ## Plan inline")).toBe(false);
		expect(hasAgentPlan("### Why now\ndeeper\n### Plan\ndeeper")).toBe(false);
	});

	it("is false for empty descriptions", () => {
		expect(hasAgentPlan(null)).toBe(false);
		expect(hasAgentPlan(undefined)).toBe(false);
		expect(hasAgentPlan("")).toBe(false);
	});
});

describe("dismissal storage", () => {
	const BOARD = "board-1";

	beforeEach(() => {
		window.localStorage.clear();
	});

	it("reads as never-dismissed when nothing is stored", () => {
		expect(loadDismissedBeats(BOARD)).toEqual([]);
	});

	it("round-trips dismissed beats per board", () => {
		saveDismissedBeats(BOARD, ["agent-plan"]);
		expect(loadDismissedBeats(BOARD)).toEqual(["agent-plan"]);
		expect(loadDismissedBeats("board-2")).toEqual([]);

		saveDismissedBeats(BOARD, ["agent-plan", "cost"]);
		expect(loadDismissedBeats(BOARD)).toEqual(["agent-plan", "cost"]);
	});

	it("dedupes on save and filters unknown beat ids on load", () => {
		saveDismissedBeats(BOARD, ["cost", "cost"]);
		expect(loadDismissedBeats(BOARD)).toEqual(["cost"]);

		window.localStorage.setItem(
			`pigeon:first-run-tour:${BOARD}`,
			JSON.stringify(["cost", "made-up-beat", 42])
		);
		expect(loadDismissedBeats(BOARD)).toEqual(["cost"]);
	});

	it("survives corrupt storage", () => {
		window.localStorage.setItem(`pigeon:first-run-tour:${BOARD}`, "{not json");
		expect(loadDismissedBeats(BOARD)).toEqual([]);
	});
});

describe("beat definitions", () => {
	it("covers every beat id with sequential steps", () => {
		expect(Object.keys(TOUR_BEATS).sort()).toEqual([...ALL_TOUR_BEATS].sort());
		expect(ALL_TOUR_BEATS.map((b) => TOUR_BEATS[b].step)).toEqual([1, 2, 3]);
	});

	it("carries the spec §5.3 beats, including the side-by-side suggestion", () => {
		expect(TOUR_BEATS["agent-plan"].title).toMatch(/written by your agent/i);
		expect(TOUR_BEATS["comment-loop"].title).toMatch(/next session sees it/i);
		expect(TOUR_BEATS.cost.title).toMatch(/what it cost/i);
		expect(TOUR_BEATS["comment-loop"].body).toMatch(/side-by-side with your terminal/i);
	});
});
