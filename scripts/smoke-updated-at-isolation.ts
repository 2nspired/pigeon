#!/usr/bin/env tsx

/**
 * Smoke test for #175: sibling `Card.updatedAt` must NOT be bumped when
 * another card moves through the same column.
 *
 * Seeds an isolated project with one column + 4 cards in known positions,
 * then walks two move scenarios:
 *
 *   A) Within-column reorder — card at position 3 → position 1.
 *      Cards at positions 1 and 2 shift down by one (they really did move,
 *      so they MAY get bumped). Card at position 0 doesn't shift —
 *      its `updatedAt` MUST be unchanged.
 *
 *   B) Cross-column move — drop a 5th card into the column at position 0.
 *      Cards at positions 0, 1, 2, 3 all shift down by one (they did move).
 *      Cards in another untouched column have `updatedAt` unchanged.
 *
 * Run: `tsx scripts/smoke-updated-at-isolation.ts` — exits 0 on success, 1 on failure.
 */

import { db } from "../src/server/db.js";
import { cardService } from "../src/server/services/card-service.js";

const TAG = `updated-at-isolation-smoke-${Date.now()}`;

let failures = 0;
const fail = (msg: string) => {
	console.error(`✗ ${msg}`);
	failures++;
};
const pass = (msg: string) => console.log(`✓ ${msg}`);

async function main() {
	const project = await db.project.create({
		data: { name: TAG, slug: TAG, description: "updatedAt isolation smoke" },
	});
	const board = await db.board.create({
		data: {
			projectId: project.id,
			name: "Smoke Board",
			columns: {
				create: [
					{ name: "Backlog", position: 0, role: "backlog" },
					{ name: "In Progress", position: 1, role: "active" },
				],
			},
		},
		include: { columns: true },
	});
	const backlog = board.columns.find((c) => c.role === "backlog")!;
	const active = board.columns.find((c) => c.role === "active")!;

	const make = (columnId: string, n: number, title: string) =>
		db.card.create({
			data: { columnId, projectId: project.id, number: n, title, position: n - 1, createdBy: "HUMAN" },
		});

	try {
		// ─── Scenario A: within-column reorder ───────────────────────────────
		const a0 = await make(backlog.id, 1, "stays at position 0");
		const a1 = await make(backlog.id, 2, "shifts to position 2");
		const a2 = await make(backlog.id, 3, "shifts to position 3");
		const a3 = await make(backlog.id, 4, "moves from 3 to 1");

		// Snapshot timestamps before the move
		const before = new Map<string, Date>();
		for (const c of [a0, a1, a2, a3]) before.set(c.id, c.updatedAt);

		// Wait long enough that any new write would produce a distinguishable
		// timestamp on the SQLite backend.
		await new Promise((r) => setTimeout(r, 25));

		const moveA = await cardService.move(a3.id, { columnId: backlog.id, position: 1 });
		if (!moveA.success) {
			fail(`within-column move failed: ${moveA.error.message}`);
			return;
		}

		const a0After = await db.card.findUniqueOrThrow({ where: { id: a0.id } });
		const a1After = await db.card.findUniqueOrThrow({ where: { id: a1.id } });
		const a2After = await db.card.findUniqueOrThrow({ where: { id: a2.id } });
		const a3After = await db.card.findUniqueOrThrow({ where: { id: a3.id } });

		// Position 0 (a0) doesn't shift — must NOT be bumped.
		a0After.updatedAt.getTime() === before.get(a0.id)?.getTime()
			? pass("within-column: untouched-position card has unchanged updatedAt")
			: fail(
					`within-column: a0 updatedAt bumped: was ${before.get(a0.id)?.toISOString()}, now ${a0After.updatedAt.toISOString()}`
				);

		// Positions 1 and 2 (a1 and a2) DID shift — they may be bumped, but
		// don't fail if they aren't (the assertion is one-directional: we only
		// guarantee untouched cards stay untouched).
		const a1Bumped = a1After.updatedAt.getTime() !== before.get(a1.id)?.getTime();
		const a2Bumped = a2After.updatedAt.getTime() !== before.get(a2.id)?.getTime();
		a1Bumped && a2Bumped
			? pass("within-column: shifted siblings (a1, a2) got their position update")
			: console.log(
					`  ℹ a1 bumped=${a1Bumped}, a2 bumped=${a2Bumped} (not asserted, just observed)`
				);

		// The moved card itself MUST have a new updatedAt.
		a3After.updatedAt.getTime() !== before.get(a3.id)?.getTime()
			? pass("within-column: moved card itself got a new updatedAt")
			: fail("within-column: moved card updatedAt unchanged — that's wrong");

		// And a3 should be at position 1 now.
		a3After.position === 1
			? pass(`within-column: moved card landed at position 1`)
			: fail(`within-column: expected a3.position=1, got ${a3After.position}`);

		// ─── Scenario B: cross-column move into the head of a populated column
		const b0 = await make(active.id, 5, "active col, position 0");
		const b1 = await make(active.id, 6, "active col, position 1");
		const beforeB = new Map<string, Date>();
		for (const c of [a0After, b0, b1]) beforeB.set(c.id, c.updatedAt);

		await new Promise((r) => setTimeout(r, 25));

		// Move a3 (currently in backlog at position 1) into active at position 0.
		// b0 and b1 shift to positions 1 and 2 — they may be bumped. But a0
		// (still in backlog) is unrelated to this move and MUST stay untouched.
		const moveB = await cardService.move(a3After.id, { columnId: active.id, position: 0 });
		if (!moveB.success) {
			fail(`cross-column move failed: ${moveB.error.message}`);
			return;
		}

		const a0AfterB = await db.card.findUniqueOrThrow({ where: { id: a0.id } });
		a0AfterB.updatedAt.getTime() === beforeB.get(a0.id)?.getTime()
			? pass("cross-column: card in unrelated column has unchanged updatedAt")
			: fail("cross-column: unrelated-column card got its updatedAt bumped");

		// Sanity: target column has 3 cards now (a3, b0, b1) at positions 0, 1, 2.
		const activeAfter = await db.card.findMany({
			where: { columnId: active.id },
			orderBy: { position: "asc" },
		});
		activeAfter.length === 3 &&
		activeAfter[0].id === a3.id &&
		activeAfter[1].id === b0.id &&
		activeAfter[2].id === b1.id
			? pass("cross-column: target column shape is correct (a3, b0, b1)")
			: fail(
					`cross-column: target column shape wrong, got ${JSON.stringify(activeAfter.map((c) => ({ id: c.id, pos: c.position })))}`
				);
	} finally {
		await db.project.delete({ where: { id: project.id } });
	}

	if (failures > 0) {
		console.error(`\n${failures} failure(s)`);
		process.exit(1);
	}
	console.log("\nAll updatedAt-isolation smoke checks passed.");
}

main()
	.catch((e) => {
		console.error("Unhandled error:", e);
		process.exit(1);
	})
	.finally(async () => {
		await db.$disconnect();
	});
