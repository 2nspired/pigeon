// @vitest-environment node
/**
 * Tests for the pure helpers in `src/lib/services/edition.ts` (#298).
 *
 * Strategy mirrors `board-audit.test.ts` — we test the deterministic,
 * side-effect-free helpers (`buildSlug`, `toRoman`, `volumeForIssue`,
 * `median`, `nextIssueNumber`) directly. The factory's I/O paths
 * (`getActivityWindow`, `publishEdition`, `getEdition`,
 * `listEditions`) are integration-tested via the MCP smoke surface and
 * the dev launchd process; reproducing a SQLite fixture for a thin
 * Prisma adapter would more than double the test size for very little
 * additional confidence.
 */

import { describe, expect, it, vi } from "vitest";

import {
	buildSlug,
	createEditionService,
	median,
	nextIssueNumber,
	toRoman,
	volumeForIssue,
} from "@/lib/services/edition";

// ─── buildSlug ────────────────────────────────────────────────────

describe("buildSlug", () => {
	it("produces a stable per-day key from periodEnd", () => {
		expect(buildSlug(new Date("2026-05-06T15:30:00Z"))).toBe("2026-05-06-daily-squawk");
	});

	it("uses UTC components (not local) so re-runs across timezones don't collide", () => {
		// 23:59 UTC — local in some timezones may be the next day, but the
		// slug must stay anchored to the UTC date.
		expect(buildSlug(new Date("2026-12-31T23:59:00Z"))).toBe("2026-12-31-daily-squawk");
	});
});

// ─── toRoman / volumeForIssue ─────────────────────────────────────

describe("toRoman", () => {
	it("renders single digits", () => {
		expect(toRoman(1)).toBe("I");
		expect(toRoman(4)).toBe("IV");
		expect(toRoman(9)).toBe("IX");
	});

	it("renders compound numerals", () => {
		expect(toRoman(14)).toBe("XIV");
		expect(toRoman(47)).toBe("XLVII");
		expect(toRoman(2026)).toBe("MMXXVI");
	});

	it("falls through on out-of-range input", () => {
		expect(toRoman(0)).toBe("0");
		expect(toRoman(-3)).toBe("-3");
		expect(toRoman(4001)).toBe("4001");
	});
});

describe("volumeForIssue", () => {
	it("buckets every 12 issues into a new volume", () => {
		expect(volumeForIssue(1)).toBe("I");
		expect(volumeForIssue(12)).toBe("I");
		expect(volumeForIssue(13)).toBe("II");
		expect(volumeForIssue(24)).toBe("II");
		expect(volumeForIssue(25)).toBe("III");
	});
});

// ─── median ──────────────────────────────────────────────────────

describe("median", () => {
	it("returns null on empty input", () => {
		expect(median([])).toBeNull();
	});

	it("handles odd-length input", () => {
		expect(median([3, 1, 5])).toBe(3);
	});

	it("handles even-length input", () => {
		expect(median([1, 2, 3, 4])).toBe(2.5);
	});

	it("does not mutate its input", () => {
		const input = [5, 2, 9, 1];
		const copy = [...input];
		median(input);
		expect(input).toEqual(copy);
	});
});

// ─── nextIssueNumber ─────────────────────────────────────────────

describe("nextIssueNumber", () => {
	it("returns count + 1", async () => {
		const fakePrisma = {
			edition: {
				count: vi.fn().mockResolvedValue(7),
			},
		} as unknown as Parameters<typeof nextIssueNumber>[0];
		await expect(nextIssueNumber(fakePrisma, "board-1")).resolves.toBe(8);
	});

	it("returns 1 on a cold board", async () => {
		const fakePrisma = {
			edition: {
				count: vi.fn().mockResolvedValue(0),
			},
		} as unknown as Parameters<typeof nextIssueNumber>[0];
		await expect(nextIssueNumber(fakePrisma, "board-1")).resolves.toBe(1);
	});
});

// ─── publishEdition immutability (slug collision returns existing) ─

describe("publishEdition — slug collision returns existing edition", () => {
	it("does not overwrite an existing row when the slug already exists", async () => {
		const existing = { id: "edition-existing", slug: "2026-05-06-daily-squawk" };
		const create = vi.fn();
		const fakePrisma = {
			board: {
				findUnique: vi.fn().mockResolvedValue({ id: "board-1", projectId: "project-1" }),
			},
			edition: {
				findUnique: vi.fn().mockResolvedValue(existing),
				create,
			},
		} as unknown as Parameters<typeof createEditionService>[0];

		const service = createEditionService(fakePrisma);
		const result = await service.publishEdition({
			boardId: "board-1",
			content: "# overwriting attempt",
			periodStart: new Date("2026-05-05T00:00:00Z"),
			periodEnd: new Date("2026-05-06T00:00:00Z"),
			masthead: { editorName: "Edith Featherstone", volume: "I", issue: 1 },
		});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.id).toBe("edition-existing");
			expect(result.data.created).toBe(false);
			expect(result.data.url).toBe("/squawk/edition-existing");
		}
		expect(create).not.toHaveBeenCalled();
	});

	it("creates a new row when no slug collision exists", async () => {
		const fakePrisma = {
			board: {
				findUnique: vi.fn().mockResolvedValue({ id: "board-1", projectId: "project-1" }),
			},
			edition: {
				findUnique: vi.fn().mockResolvedValue(null),
				create: vi.fn().mockResolvedValue({ id: "edition-new", slug: "2026-05-06-daily-squawk" }),
			},
		} as unknown as Parameters<typeof createEditionService>[0];

		const service = createEditionService(fakePrisma);
		const result = await service.publishEdition({
			boardId: "board-1",
			content: "# fresh issue",
			periodStart: new Date("2026-05-05T00:00:00Z"),
			periodEnd: new Date("2026-05-06T00:00:00Z"),
			masthead: { editorName: "Edith Featherstone", volume: "I", issue: 1 },
		});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.id).toBe("edition-new");
			expect(result.data.created).toBe(true);
		}
	});

	it("fails when the board does not exist", async () => {
		const fakePrisma = {
			board: {
				findUnique: vi.fn().mockResolvedValue(null),
			},
			edition: {
				findUnique: vi.fn(),
				create: vi.fn(),
			},
		} as unknown as Parameters<typeof createEditionService>[0];

		const service = createEditionService(fakePrisma);
		const result = await service.publishEdition({
			boardId: "missing",
			content: "# x",
			periodStart: new Date(),
			periodEnd: new Date(),
			masthead: { editorName: "Edith Featherstone", volume: "I", issue: 1 },
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("BOARD_NOT_FOUND");
		}
	});
});
