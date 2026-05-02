// Locks down the per-session aggregation + pricing arithmetic of the
// Pigeon-overhead helpers (#194). Uses the established DB-backed fixture
// (`test-db.ts`, F1 #190) so session resolution + model-rate lookup run
// against real Prisma queries — not a mock — which is the layer most
// likely to drift if someone changes the underlying TokenUsageEvent /
// ToolCallLog shape.
//
// History: this file used to lock down `getPigeonOverhead` (the
// project-wide period-windowed lens that backed `<PigeonOverheadSection>`
// on the Costs page). That procedure + its component were removed in
// #236 — only `getSessionPigeonOverhead`, which still backs
// `<PigeonOverheadChip>` on session sheets, is exercised here now.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "@/server/services/__tests__/test-db";

const dbRef = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/server/db", () => ({
	get db() {
		return dbRef.current;
	},
}));

const { tokenUsageService } = await import("@/server/services/token-usage-service");

describe("getSessionPigeonOverhead", () => {
	let testDb: TestDb;
	const SESSION = "ovh-session-1";
	const SESSION_EMPTY = "ovh-session-empty";

	beforeAll(async () => {
		testDb = await createTestDb();
		dbRef.current = testDb.prisma;

		const PROJ = "60000000-6000-4000-8000-600000000001";
		await testDb.prisma.project.create({
			data: { id: PROJ, name: "P", slug: "p-194-session" },
		});
		await testDb.prisma.tokenUsageEvent.create({
			data: {
				sessionId: SESSION,
				projectId: PROJ,
				cardId: null,
				agentName: "test-agent",
				model: "claude-opus-4-7",
				inputTokens: 1,
				outputTokens: 1,
				cacheReadTokens: 0,
				cacheCreation1hTokens: 0,
				cacheCreation5mTokens: 0,
			},
		});
		await testDb.prisma.toolCallLog.createMany({
			data: [
				{
					toolName: "getCardContext",
					toolType: "extended",
					agentName: "test-agent",
					sessionId: SESSION,
					durationMs: 5,
					success: true,
					responseTokens: 1_000_000,
				},
				{
					toolName: "saveHandoff",
					toolType: "essential",
					agentName: "test-agent",
					sessionId: SESSION,
					durationMs: 5,
					success: true,
					responseTokens: 100_000,
				},
			],
		});
	});

	afterAll(async () => {
		dbRef.current = null;
		await testDb.cleanup();
	});

	it("returns the per-session cost using the session's model rate", async () => {
		const result = await tokenUsageService.getSessionPigeonOverhead(SESSION);
		expect(result.success).toBe(true);
		if (!result.success) return;
		// 1.1M response tokens × $75/M output = $82.50
		expect(result.data.callCount).toBe(2);
		expect(result.data.totalCostUsd).toBeCloseTo(82.5, 5);
	});

	it("returns 0/0 (not an error) for a session with no ToolCallLog rows", async () => {
		const result = await tokenUsageService.getSessionPigeonOverhead(SESSION_EMPTY);
		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.data.callCount).toBe(0);
		expect(result.data.totalCostUsd).toBe(0);
	});
});
