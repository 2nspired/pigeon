#!/usr/bin/env tsx

/**
 * Smoke test for the Done-column blocker filter (card #115).
 *
 * Seeds the four blocker-state quadrants and asserts that getBlockers only
 * surfaces the genuinely active one:
 *
 *   1. active blocks active → SHOWS
 *   2. done   blocks active → hidden (defensive: shipped blocker isn't blocking)
 *   3. active blocks done   → hidden (primary: shipped card can't be blocked)
 *   4. done   blocks done   → hidden
 *
 * Also asserts boardId-less calls (cross-board sweep) apply the same filter.
 *
 * Run: `tsx scripts/smoke-blocker-done-filter.ts` — exits 0 on success, 1 on failure.
 */

import { getBlockers, linkCards } from "../src/lib/services/relations.js";
import { db } from "../src/server/db.js";

const TAG = `blocker-done-smoke-${Date.now()}`;

let failures = 0;
const fail = (msg: string) => {
	console.error(`✗ ${msg}`);
	failures++;
};
const pass = (msg: string) => console.log(`✓ ${msg}`);

async function main() {
	const project = await db.project.create({
		data: { name: TAG, slug: TAG, description: "Done-column blocker filter smoke" },
	});
	const board = await db.board.create({
		data: {
			projectId: project.id,
			name: "Smoke Board",
			columns: {
				create: [
					{ name: "In Progress", position: 0, role: "active" },
					{ name: "Done", position: 1, role: "done" },
				],
			},
		},
		include: { columns: true },
	});
	const active = board.columns.find((c) => c.role === "active")!;
	const done = board.columns.find((c) => c.role === "done")!;

	const make = (columnId: string, n: number, title: string) =>
		db.card.create({
			data: { columnId, projectId: project.id, number: n, title, position: n, createdBy: "HUMAN" },
		});

	try {
		// ─── Seed four cards across two columns ──────────────────────────────
		const activeBlocked = await make(active.id, 1, "active-blocked");
		const activeBlocker = await make(active.id, 2, "active-blocker");
		const doneBlocked = await make(done.id, 3, "done-blocked");
		const doneBlocker = await make(done.id, 4, "done-blocker");

		const link = (from: string, to: string) =>
			linkCards(db, { fromCardId: from, toCardId: to, type: "blocks", actorName: "smoke" });

		// ─── Four quadrants of (blocker → blocked) ───────────────────────────
		await link(activeBlocker.id, activeBlocked.id); // 1. active blocks active → SHOWS
		await link(doneBlocker.id, activeBlocked.id); // 2. done   blocks active → hidden
		await link(activeBlocker.id, doneBlocked.id); // 3. active blocks done   → hidden
		await link(doneBlocker.id, doneBlocked.id); // 4. done   blocks done   → hidden

		// ─── Board-scoped call ───────────────────────────────────────────────
		const scoped = await getBlockers(db, board.id);
		const scopedNumbers = new Set(scoped.map((e) => e.card.number));
		scoped.length === 1 && scopedNumbers.has(activeBlocked.number)
			? pass("board-scoped: only active-blocked surfaces")
			: fail(
					`board-scoped: expected only #${activeBlocked.number}, got ${JSON.stringify([...scopedNumbers])}`
				);

		const entry = scoped.find((e) => e.card.number === activeBlocked.number);
		if (entry) {
			const blockerNums = entry.blockedBy.map((b) => b.number);
			blockerNums.length === 1 && blockerNums[0] === activeBlocker.number
				? pass("board-scoped: blockedBy contains only the active blocker")
				: fail(
						`board-scoped: blockedBy expected [#${activeBlocker.number}], got ${JSON.stringify(blockerNums)}`
					);
		}

		// ─── Cross-board (no boardId) call ───────────────────────────────────
		// Filter by tag prefix to avoid colliding with other projects in the dev DB.
		const all = await getBlockers(db);
		const ours = all.filter((e) => [activeBlocked.id, doneBlocked.id].includes(e.card.id));
		ours.length === 1 && ours[0].card.id === activeBlocked.id
			? pass("cross-board: only active-blocked surfaces from this seed")
			: fail(
					`cross-board: expected single entry for #${activeBlocked.number}, got ${JSON.stringify(ours.map((e) => e.card.number))}`
				);

		// ─── Done-card defense: even if blockedBy lingers, none surfaces ─────
		const doneSeed = all.find((e) => e.card.id === doneBlocked.id);
		!doneSeed
			? pass("cross-board: no entry surfaces for the Done-blocked card")
			: fail("cross-board: Done-blocked card leaked into blockers");
	} finally {
		await db.project.delete({ where: { id: project.id } });
	}

	if (failures > 0) {
		console.error(`\n${failures} failure(s)`);
		process.exit(1);
	}
	console.log("\nAll blocker-done-filter smoke checks passed.");
}

main()
	.catch((e) => {
		console.error("Unhandled error:", e);
		process.exit(1);
	})
	.finally(async () => {
		await db.$disconnect();
	});
