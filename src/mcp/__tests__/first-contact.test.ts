/**
 * First-contact teaching payload (#315).
 *
 * Locks in the three contracts of agent-taught onboarding:
 *   1. The freshness predicate — zero cards AND zero handoffs, nothing else.
 *   2. The payload shape + token ceiling (~800 estimated tokens).
 *   3. Registry executability — every tool-call string embedded in the
 *      payload resolves against the post-#317 registry verbatim: `planCard`
 *      as a direct essential call, `bulkCreateCards` via runTool. Zero
 *      "tool not found" traps (slice acceptance (d)).
 */

import { describe, expect, it } from "vitest";

// Populate the extended registry — same side-effect import the server and
// the catalog/docs sync scripts use.
import "../register-all-tools";

import type { PrismaClient } from "prisma/generated/client";
import {
	buildFirstContactPayload,
	type FirstContactPayload,
	isFirstContact,
} from "../../lib/onboarding/first-contact";
import { ESSENTIAL_TOOLS } from "../manifest";
import { getAllExtendedTools } from "../tool-registry";

// ─── Freshness predicate ───────────────────────────────────────────

function mockDb(cards: number, handoffs: number): PrismaClient {
	return {
		card: { count: async () => cards },
		handoff: { count: async () => handoffs },
	} as unknown as PrismaClient;
}

describe("isFirstContact (freshness predicate)", () => {
	it("is true for a board with zero cards and zero handoffs", async () => {
		await expect(isFirstContact(mockDb(0, 0), "board-1")).resolves.toBe(true);
	});

	it("is false once any card exists (hand-seeded boards skip teaching)", async () => {
		await expect(isFirstContact(mockDb(1, 0), "board-1")).resolves.toBe(false);
	});

	it("is false once a handoff exists (teaching never re-fires)", async () => {
		await expect(isFirstContact(mockDb(0, 1), "board-1")).resolves.toBe(false);
	});

	it("is false when both exist", async () => {
		await expect(isFirstContact(mockDb(3, 2), "board-1")).resolves.toBe(false);
	});
});

// ─── Payload shape + budget + registry resolution ──────────────────

const BOARD_ID = "3f6a2f6e-9d4e-4f7a-b1c2-0123456789ab";

function buildFixture(withPolicy = false): FirstContactPayload {
	return buildFirstContactPayload({
		boardId: BOARD_ID,
		projectName: "My App",
		boardName: "Main Board",
		repoPath: "/Users/someone/Projects/my-app",
		policy: withPolicy
			? {
					prompt: "P".repeat(1000),
					intent_required_on: ["moveCard", "deleteCard"],
					columns: {},
					schema_version: 1,
				}
			: null,
	});
}

describe("buildFirstContactPayload", () => {
	const payload = buildFixture();

	it("has the teaching-payload shape", () => {
		expect(payload.firstContact).toBe(true);
		expect(payload.board).toEqual({
			boardId: BOARD_ID,
			projectName: "My App",
			boardName: "Main Board",
			repoPath: "/Users/someone/Projects/my-app",
		});
		expect(payload.positioning).toContain("visible workbench");
		expect(payload.paradigm).toHaveLength(4);
		expect(payload.voice).toMatch(/own voice|not a script/);
		expect(payload._hint).toBeTruthy();
	});

	it("walks the six narrative beats in order", () => {
		expect(payload.protocol.map((s) => s.step)).toEqual([1, 2, 3, 4, 5, 6]);
		expect(payload.protocol[0].do).toMatch(/paradigm/i);
		// Step 2: the agent scans with its own tools — Pigeon does not scan.
		expect(payload.protocol[1].do).toMatch(/Pigeon does not scan/);
		expect(payload.protocol[1].do).toContain("git log --oneline -20");
		// Step 3: propose in chat first.
		expect(payload.protocol[2].do).toMatch(/4-8/);
		expect(payload.protocol[2].do).toMatch(/chat first/);
		// Step 5: chat is draft, card is publish.
		expect(payload.protocol[4].note).toMatch(/Chat is draft; card is publish/);
		// Step 6: the handoff loop.
		expect(payload.protocol[5].do).toContain("saveHandoff");
		expect(payload.protocol[5].do).toMatch(/briefMe/);
	});

	it("stays under the ~800 estimated-token ceiling (with and without policy)", () => {
		const estimate = (p: unknown) => Math.ceil(JSON.stringify(p).length / 4);
		expect(estimate(payload)).toBeLessThanOrEqual(800);
		expect(estimate(buildFixture(true))).toBeLessThanOrEqual(800);
	});

	it("truncates a long tracker.md prompt instead of blowing the budget", () => {
		const withPolicy = buildFixture(true);
		expect(withPolicy.policy?.intentRequiredOn).toEqual(["moveCard", "deleteCard"]);
		expect(withPolicy.policy?.prompt.length).toBeLessThanOrEqual(401); // 400 + ellipsis
	});

	it("omits the policy key when the board has no tracker.md", () => {
		expect(payload.policy).toBeUndefined();
	});
});

describe("embedded tool-call strings resolve in the post-#317 registry", () => {
	const payload = buildFixture();
	const json = JSON.stringify(payload);

	const essentialNames = new Set(ESSENTIAL_TOOLS.map((t) => t.name));
	const extendedNames = new Set(getAllExtendedTools().map((t) => t.name));

	it("every direct call `name({...})` in the payload is an essential tool", () => {
		// Matches e.g. planCard({ ... }), saveHandoff({ ... }), runTool({ ... })
		const directCalls = [...json.matchAll(/\b([a-zA-Z][\w]*)\(\{/g)].map((m) => m[1]);
		expect(directCalls.length).toBeGreaterThan(0);
		for (const name of directCalls) {
			expect(essentialNames, `direct call \`${name}\` must be essential`).toContain(name);
		}
	});

	it("every runTool target is an extended tool", () => {
		const runToolTargets = [...json.matchAll(/runTool\(\{ tool: '([\w]+)'/g)].map((m) => m[1]);
		expect(runToolTargets).toEqual(["bulkCreateCards"]);
		for (const name of runToolTargets) {
			expect(extendedNames, `runTool target \`${name}\` must be extended`).toContain(name);
		}
	});

	it("planCard is called directly, never via runTool (post-#317)", () => {
		expect(json).toContain(`planCard({ boardId: '${BOARD_ID}'`);
		expect(json).not.toMatch(/runTool\(\{ tool: '(planCard|briefMe|saveHandoff)'/);
	});

	it("call strings embed the real boardId so they are executable verbatim", () => {
		const calls = payload.protocol.filter((s) => s.call).map((s) => s.call as string);
		expect(calls).toHaveLength(2);
		for (const call of calls) {
			expect(call).toContain(BOARD_ID);
		}
	});
});
