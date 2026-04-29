#!/usr/bin/env tsx

/**
 * Smoke test for briefMe.topWork "pinned" tier (#97).
 *
 * Verifies that the top-3 positions in Backlog are tiered as `source: "pinned"`
 * and surface ahead of higher-scored deeper-position cards (`source: "scored"`).
 *
 * The test exercises the same scoring + tier logic the server uses, inline,
 * to avoid spinning up the full MCP transport.
 *
 * Run: `tsx scripts/smoke-pinned-topwork.ts`
 */

import { computeWorkNextScore } from "../src/lib/work-next-score.js";
import { hasRole } from "../src/lib/column-roles.js";
import { db } from "../src/server/db.js";

const TAG = `pinned-topwork-smoke-${Date.now()}`;
const PIN_THRESHOLD = 3;

let failures = 0;
const fail = (msg: string) => {
	console.error(`✗ ${msg}`);
	failures++;
};
const pass = (msg: string) => console.log(`✓ ${msg}`);

interface Scored {
	ref: string;
	title: string;
	column: string;
	priority: string;
	score: number;
	source: "active" | "pinned" | "scored";
}

async function buildTopWork(boardId: string): Promise<Scored[]> {
	const board = await db.board.findUniqueOrThrow({
		where: { id: boardId },
		include: {
			columns: {
				orderBy: { position: "asc" },
				include: {
					cards: {
						orderBy: { position: "asc" },
						select: {
							id: true,
							number: true,
							title: true,
							position: true,
							priority: true,
							updatedAt: true,
							dueDate: true,
							checklists: { select: { completed: true } },
							relationsTo: { where: { type: "blocks" }, select: { id: true } },
							relationsFrom: { where: { type: "blocks" }, select: { id: true } },
						},
					},
				},
			},
		},
	});

	const allCards = board.columns.flatMap((col) =>
		col.cards.map((card) => ({ card, column: col }))
	);
	const openCards = allCards.filter(
		({ column }) => !hasRole(column, "done") && !hasRole(column, "parking")
	);

	const scored = openCards
		.map(({ card, column }) => ({
			ref: `#${card.number}`,
			title: card.title,
			column: column.name,
			priority: card.priority,
			score: computeWorkNextScore({
				priority: card.priority,
				updatedAt: card.updatedAt,
				dueDate: card.dueDate,
				checklists: card.checklists,
				_blockedByCount: card.relationsTo.length,
				_blocksOtherCount: card.relationsFrom.length,
			}),
			source: hasRole(column, "active")
				? ("active" as const)
				: hasRole(column, "backlog") && card.position < PIN_THRESHOLD
					? ("pinned" as const)
					: ("scored" as const),
		}))
		.filter((c) => c.score >= 0);

	const tierRank = { active: 0, pinned: 1, scored: 2 } as const;
	return scored
		.sort((a, b) => tierRank[a.source] - tierRank[b.source] || b.score - a.score)
		.slice(0, 3);
}

async function main() {
	const project = await db.project.create({
		data: { name: TAG, slug: TAG, description: "briefMe pinned topWork smoke" },
	});
	const board = await db.board.create({
		data: {
			projectId: project.id,
			name: "Smoke Board",
			columns: {
				create: [
					{ name: "Backlog", position: 0, role: "backlog" },
					{ name: "In Progress", position: 1, role: "active" },
					{ name: "Done", position: 2, role: "done" },
				],
			},
		},
		include: { columns: true },
	});
	const backlog = board.columns.find((c) => c.role === "backlog")!;

	const make = (n: number, position: number, title: string, priority = "LOW") =>
		db.card.create({
			data: {
				columnId: backlog.id,
				projectId: project.id,
				number: n,
				title,
				position,
				priority,
				createdBy: "HUMAN",
			},
		});

	try {
		// Seed:
		//   pos 0: low-priority "pinned-1"  → should surface as pinned (tier 1)
		//   pos 1: low-priority "pinned-2"  → should surface as pinned
		//   pos 2: low-priority "pinned-3"  → should surface as pinned
		//   pos 3: HIGH-priority "scored-hi" → would outscore the pinned, but is below threshold
		//   pos 4: low-priority "scored-lo"
		await make(1, 0, "pinned-1", "LOW");
		await make(2, 1, "pinned-2", "LOW");
		await make(3, 2, "pinned-3", "LOW");
		await make(4, 3, "scored-hi", "HIGH"); // would outscore pinned by priority alone
		await make(5, 4, "scored-lo", "LOW");

		const top = await buildTopWork(board.id);

		// Top 3 should be the pinned ones
		const refs = top.map((c) => c.ref);
		const sources = top.map((c) => c.source);

		JSON.stringify(refs) === JSON.stringify(["#1", "#2", "#3"])
			? pass("topWork order: pinned-1, pinned-2, pinned-3 (positions 0-2)")
			: fail(`topWork refs expected [#1,#2,#3], got ${JSON.stringify(refs)}`);

		sources.every((s) => s === "pinned")
			? pass("all three top cards have source='pinned'")
			: fail(`sources expected all 'pinned', got ${JSON.stringify(sources)}`);

		// Verify scored-hi is NOT in top 3 despite higher score — proves pin tier wins
		!refs.includes("#4")
			? pass("HIGH-priority scored-hi at position 3 correctly excluded from top 3")
			: fail("scored-hi (HIGH at pos 3) leaked into top 3 — pinned tier not winning");

		// ─── Sanity: with fewer pinned, scored fills the rest ────────────────
		// Delete pinned-2 and pinned-3 → only 1 pinned left, scored-hi should now appear
		await db.card.deleteMany({ where: { number: { in: [2, 3] }, projectId: project.id } });
		// Re-position remaining cards in Backlog after deletion
		const remaining = await db.card.findMany({
			where: { columnId: backlog.id },
			orderBy: { position: "asc" },
		});
		for (let i = 0; i < remaining.length; i++) {
			if (remaining[i].position !== i) {
				await db.card.update({ where: { id: remaining[i].id }, data: { position: i } });
			}
		}

		const top2 = await buildTopWork(board.id);
		const refs2 = top2.map((c) => c.ref);
		const sources2 = top2.map((c) => c.source);

		// After re-pos: #1 at 0 (pinned), #4 at 1 (now pinned, was scored), #5 at 2 (now pinned)
		// All three are now within PIN_THRESHOLD = pinned tier
		refs2.length === 3 && refs2.includes("#1") && refs2.includes("#4") && refs2.includes("#5")
			? pass("post-shrink: all three remaining surface in top 3")
			: fail(`post-shrink: expected #1,#4,#5, got ${JSON.stringify(refs2)}`);

		sources2.every((s) => s === "pinned")
			? pass("post-shrink: all three are 'pinned' (within threshold after shift)")
			: fail(`post-shrink sources expected all 'pinned', got ${JSON.stringify(sources2)}`);

		// ─── Active-tier still wins over pinned ──────────────────────────────
		const inProgress = board.columns.find((c) => c.role === "active")!;
		await db.card.create({
			data: {
				columnId: inProgress.id,
				projectId: project.id,
				number: 99,
				title: "active-card",
				position: 0,
				priority: "LOW",
				createdBy: "HUMAN",
			},
		});

		const top3 = await buildTopWork(board.id);
		top3[0]?.source === "active" && top3[0]?.ref === "#99"
			? pass("active card outranks pinned (tier 0 > tier 1)")
			: fail(`active should be first, got ${JSON.stringify(top3.map((c) => [c.ref, c.source]))}`);
	} finally {
		await db.project.delete({ where: { id: project.id } });
	}

	if (failures > 0) {
		console.error(`\n${failures} failure(s)`);
		process.exit(1);
	}
	console.log("\nAll pinned-topwork smoke checks passed.");
}

main()
	.catch((e) => {
		console.error("Unhandled error:", e);
		process.exit(1);
	})
	.finally(async () => {
		await db.$disconnect();
	});
