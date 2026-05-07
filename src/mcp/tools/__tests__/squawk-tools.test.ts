// @vitest-environment node
/**
 * Tests for the pure helpers in `src/mcp/tools/squawk-tools.ts` (#298).
 *
 * `resolvePeriod` parses the user-facing period syntax — covered for
 * the four documented inputs (default, Nd, range, garbage). `formatLongDate`
 * is the masthead chrome string. The handler bodies (which talk to the
 * MCP db + git + the editor service) are exercised via the live MCP
 * server for smoke testing rather than reproduced here.
 */

import { describe, expect, it, vi } from "vitest";

import { formatLongDate, resolvePeriod } from "@/mcp/tools/squawk-tools";

describe("resolvePeriod", () => {
	it("defaults to last 24h on undefined / empty input", () => {
		const a = resolvePeriod(undefined);
		const b = resolvePeriod("");
		const c = resolvePeriod("   ");
		expect(a.label).toBe("last 24h");
		expect(b.label).toBe("last 24h");
		expect(c.label).toBe("last 24h");
		// 24h windows: end ≈ now, start ≈ 24h prior.
		const diffMs = a.periodEnd.getTime() - a.periodStart.getTime();
		expect(diffMs).toBeGreaterThan(23 * 60 * 60 * 1000);
		expect(diffMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 1000);
	});

	it("parses Nd shorthand (1d / 7d / 30d)", () => {
		const oneDay = resolvePeriod("1d");
		expect(oneDay.label).toBe("last 1 day");

		const week = resolvePeriod("7d");
		expect(week.label).toBe("last 7 days");
		expect(week.periodEnd.getTime() - week.periodStart.getTime()).toBeCloseTo(
			7 * 24 * 60 * 60 * 1000,
			-3
		);

		const month = resolvePeriod("30d");
		expect(month.label).toBe("last 30 days");
	});

	it("clamps Nd input into [1, 365]", () => {
		const tiny = resolvePeriod("0d");
		// 0d is parsed as N=0; clamp to 1.
		expect(tiny.label).toBe("last 1 day");

		const huge = resolvePeriod("9999d");
		expect(huge.label).toBe("last 365 days");
	});

	it("parses YYYY-MM-DD/YYYY-MM-DD ranges in UTC", () => {
		const range = resolvePeriod("2026-04-01/2026-04-30");
		expect(range.label).toBe("2026-04-01 to 2026-04-30");
		expect(range.periodStart.toISOString()).toBe("2026-04-01T00:00:00.000Z");
		expect(range.periodEnd.toISOString()).toBe("2026-04-30T23:59:59.999Z");
	});

	it("rejects an inverted range (end < start)", () => {
		expect(() => resolvePeriod("2026-04-30/2026-04-01")).toThrow(/Invalid period range/);
	});

	it("rejects garbage input", () => {
		expect(() => resolvePeriod("yesterday")).toThrow(/Unrecognized period/);
		expect(() => resolvePeriod("7days")).toThrow(/Unrecognized period/);
	});
});

describe("formatLongDate", () => {
	it("renders the masthead chrome format", () => {
		expect(formatLongDate(new Date("2026-05-06T12:00:00Z"))).toBe("Wednesday, May 6, 2026");
		expect(formatLongDate(new Date("2026-01-01T00:00:00Z"))).toBe("Thursday, January 1, 2026");
	});

	it("uses UTC components (not local) so dates don't shift across timezones", () => {
		// Same epoch instant — should always read as the UTC date.
		const d = new Date(Date.UTC(2026, 6, 4, 23, 30));
		expect(formatLongDate(d)).toBe("Saturday, July 4, 2026");
		// silence unused-var lint by keeping `vi` referenced (used below)
		expect(vi).toBeDefined();
	});
});
