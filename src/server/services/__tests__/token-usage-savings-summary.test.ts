// Tests for `getSavingsSummary` (#273 — revived from #236).
//
// Cheap reader for `Project.metadata.tokenBaseline`. Three paths to lock:
//   1. Project missing → NOT_FOUND
//   2. Baseline never measured (no `tokenBaseline` key) → null
//   3. Baseline present → derived savings + savingsPct from persisted
//      briefMeTokens + naiveBootstrapTokens
//   4. Partial / corrupted baseline → null (don't fabricate numbers)

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "@/server/services/__tests__/test-db";

const dbRef = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/server/db", () => ({
	get db() {
		return dbRef.current;
	},
}));

const { tokenUsageService } = await import("@/server/services/token-usage-service");

describe("getSavingsSummary", () => {
	let testDb: TestDb;

	const PROJECT_ID = "70000000-7000-4000-8000-700000000273";
	const MISSING_PROJECT_ID = "70000000-7000-4000-8000-700000000274";

	beforeAll(async () => {
		testDb = await createTestDb();
		dbRef.current = testDb.prisma;

		await testDb.prisma.project.create({
			data: { id: PROJECT_ID, name: "Savings", slug: "savings-273" },
		});
	});

	afterAll(async () => {
		dbRef.current = null;
		await testDb.cleanup();
	});

	async function setMetadata(value: object | null) {
		await testDb.prisma.project.update({
			where: { id: PROJECT_ID },
			data: { metadata: value === null ? "{}" : JSON.stringify(value) },
		});
	}

	it("returns NOT_FOUND when the project doesn't exist", async () => {
		const result = await tokenUsageService.getSavingsSummary(MISSING_PROJECT_ID);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.code).toBe("NOT_FOUND");
	});

	it("returns null when the baseline has never been measured", async () => {
		await setMetadata(null);
		const result = await tokenUsageService.getSavingsSummary(PROJECT_ID);
		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.data).toBeNull();
	});

	it("derives savings + savingsPct from persisted briefMe vs naive tokens", async () => {
		await setMetadata({
			tokenBaseline: {
				briefMeTokens: 3500,
				naiveBootstrapTokens: 14000,
				measuredAt: "2026-05-02T12:00:00.000Z",
			},
		});
		const result = await tokenUsageService.getSavingsSummary(PROJECT_ID);
		expect(result.success).toBe(true);
		if (!result.success || !result.data) return;
		expect(result.data.briefMeTokens).toBe(3500);
		expect(result.data.naiveBootstrapTokens).toBe(14000);
		expect(result.data.savings).toBe(10500);
		// 10500 / 14000 = 0.75
		expect(result.data.savingsPct).toBeCloseTo(0.75, 5);
		expect(result.data.measuredAt).toBe("2026-05-02T12:00:00.000Z");
	});

	it("returns null on a partial baseline (don't fabricate numbers)", async () => {
		// Pin: a `tokenBaseline` key that's missing required fields should
		// surface as "not yet measured" so the UI prompts a fresh recalibrate
		// rather than rendering misleading numbers.
		await setMetadata({
			tokenBaseline: {
				briefMeTokens: 3500,
				// missing naiveBootstrapTokens + measuredAt
			},
		});
		const result = await tokenUsageService.getSavingsSummary(PROJECT_ID);
		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.data).toBeNull();
	});

	it("includes latestHandoffTokens when present", async () => {
		await setMetadata({
			tokenBaseline: {
				briefMeTokens: 3500,
				naiveBootstrapTokens: 14000,
				latestHandoffTokens: 1200,
				measuredAt: "2026-05-02T12:00:00.000Z",
			},
		});
		const result = await tokenUsageService.getSavingsSummary(PROJECT_ID);
		expect(result.success).toBe(true);
		if (!result.success || !result.data) return;
		expect(result.data.latestHandoffTokens).toBe(1200);
	});
});
