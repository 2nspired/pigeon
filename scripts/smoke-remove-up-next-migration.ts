#!/usr/bin/env tsx

/**
 * Smoke test for scripts/migrate-remove-up-next.ts (#97).
 *
 * Sets up a synthetic board with Up Next + Backlog cards, runs the migration
 * logic inline (same transaction shape as the script), and asserts:
 *   - Up Next cards land at top of Backlog (positions 0..N-1)
 *   - Existing Backlog cards shift down by N positions, preserving order
 *   - Up Next column is deleted
 *   - Remaining columns are re-positioned contiguously from 0
 *   - Idempotent: a second run is a no-op
 *
 * Run: `tsx scripts/smoke-remove-up-next-migration.ts`
 */

import { db } from "../src/server/db.js";

const TAG = `remove-upnext-smoke-${Date.now()}`;

let failures = 0;
const fail = (msg: string) => {
	console.error(`✗ ${msg}`);
	failures++;
};
const pass = (msg: string) => console.log(`✓ ${msg}`);

async function runMigration(boardId: string) {
	const board = await db.board.findUniqueOrThrow({
		where: { id: boardId },
		include: {
			columns: { include: { cards: { orderBy: { position: "asc" } } }, orderBy: { position: "asc" } },
		},
	});

	const upNextCol = board.columns.find((c) => c.role === "todo");
	if (!upNextCol) return false;

	const backlogCol = board.columns.find((c) => c.role === "backlog");
	if (!backlogCol) return false;

	const upNextCards = upNextCol.cards;
	const backlogCards = backlogCol.cards;
	const shift = upNextCards.length;

	await db.$transaction(async (tx) => {
		for (let i = backlogCards.length - 1; i >= 0; i--) {
			const card = backlogCards[i];
			await tx.card.update({
				where: { id: card.id },
				data: { position: card.position + shift },
			});
		}
		for (let i = 0; i < upNextCards.length; i++) {
			const card = upNextCards[i];
			await tx.card.update({
				where: { id: card.id },
				data: { columnId: backlogCol.id, position: i },
			});
		}
		await tx.column.delete({ where: { id: upNextCol.id } });
		const remaining = await tx.column.findMany({
			where: { boardId: board.id },
			orderBy: { position: "asc" },
		});
		for (let i = 0; i < remaining.length; i++) {
			if (remaining[i].position !== i) {
				await tx.column.update({
					where: { id: remaining[i].id },
					data: { position: i },
				});
			}
		}
	});
	return true;
}

async function main() {
	const project = await db.project.create({
		data: { name: TAG, slug: TAG, description: "Up Next removal migration smoke" },
	});
	const board = await db.board.create({
		data: {
			projectId: project.id,
			name: "Smoke Board",
			columns: {
				create: [
					{ name: "Backlog", position: 0, role: "backlog" },
					{ name: "Up Next", position: 1, role: "todo" },
					{ name: "In Progress", position: 2, role: "active" },
					{ name: "Done", position: 3, role: "done" },
				],
			},
		},
		include: { columns: true },
	});
	const backlog = board.columns.find((c) => c.role === "backlog")!;
	const upNext = board.columns.find((c) => c.role === "todo")!;

	const make = (columnId: string, n: number, position: number, title: string) =>
		db.card.create({
			data: { columnId, projectId: project.id, number: n, title, position, createdBy: "HUMAN" },
		});

	try {
		// Up Next: 2 cards in order ("up-1", "up-2")
		const up1 = await make(upNext.id, 1, 0, "up-1");
		const up2 = await make(upNext.id, 2, 1, "up-2");
		// Backlog: 3 cards in order ("bl-1", "bl-2", "bl-3")
		const bl1 = await make(backlog.id, 3, 0, "bl-1");
		const bl2 = await make(backlog.id, 4, 1, "bl-2");
		const bl3 = await make(backlog.id, 5, 2, "bl-3");

		// ─── First migration run ─────────────────────────────────────────────
		const ran = await runMigration(board.id);
		ran ? pass("migration ran (returned true)") : fail("migration claimed no Up Next column");

		const post = await db.board.findUniqueOrThrow({
			where: { id: board.id },
			include: {
				columns: { include: { cards: { orderBy: { position: "asc" } } }, orderBy: { position: "asc" } },
			},
		});

		// Up Next column gone
		post.columns.find((c) => c.role === "todo")
			? fail("Up Next column still exists after migration")
			: pass("Up Next column deleted");

		// Column count reduced from 4 to 3
		post.columns.length === 3
			? pass("column count reduced 4 → 3")
			: fail(`column count expected 3, got ${post.columns.length}`);

		// Columns re-positioned contiguously
		const positions = post.columns.map((c) => c.position).sort();
		JSON.stringify(positions) === JSON.stringify([0, 1, 2])
			? pass("remaining columns positioned 0,1,2 contiguously")
			: fail(`positions expected [0,1,2], got ${JSON.stringify(positions)}`);

		// Backlog has all 5 cards, ordered: up-1, up-2, bl-1, bl-2, bl-3
		const newBacklog = post.columns.find((c) => c.role === "backlog")!;
		const order = newBacklog.cards.map((c) => c.title);
		const expected = ["up-1", "up-2", "bl-1", "bl-2", "bl-3"];
		JSON.stringify(order) === JSON.stringify(expected)
			? pass(`Backlog order: ${expected.join(", ")}`)
			: fail(`Backlog order expected ${JSON.stringify(expected)}, got ${JSON.stringify(order)}`);

		// Positions are 0..4 contiguous
		const cardPositions = newBacklog.cards.map((c) => c.position);
		JSON.stringify(cardPositions) === JSON.stringify([0, 1, 2, 3, 4])
			? pass("card positions 0..4 contiguous")
			: fail(`card positions expected [0,1,2,3,4], got ${JSON.stringify(cardPositions)}`);

		// Verify each specific card landed where expected
		const byNumber = new Map(newBacklog.cards.map((c) => [c.number, c]));
		byNumber.get(up1.number)?.position === 0
			? pass("up-1 at position 0")
			: fail(`up-1 expected position 0, got ${byNumber.get(up1.number)?.position}`);
		byNumber.get(up2.number)?.position === 1
			? pass("up-2 at position 1")
			: fail(`up-2 expected position 1, got ${byNumber.get(up2.number)?.position}`);
		byNumber.get(bl1.number)?.position === 2
			? pass("bl-1 shifted to position 2")
			: fail(`bl-1 expected position 2, got ${byNumber.get(bl1.number)?.position}`);
		byNumber.get(bl2.number)?.position === 3
			? pass("bl-2 shifted to position 3")
			: fail(`bl-2 expected position 3, got ${byNumber.get(bl2.number)?.position}`);
		byNumber.get(bl3.number)?.position === 4
			? pass("bl-3 shifted to position 4")
			: fail(`bl-3 expected position 4, got ${byNumber.get(bl3.number)?.position}`);

		// ─── Idempotency: second run should be a no-op ───────────────────────
		const ran2 = await runMigration(board.id);
		!ran2
			? pass("idempotent: second run skipped (no Up Next column)")
			: fail("idempotent check failed: migration ran a second time");

		// ─── Empty Up Next case (separate board) ─────────────────────────────
		const board2 = await db.board.create({
			data: {
				projectId: project.id,
				name: "Empty Up Next Board",
				columns: {
					create: [
						{ name: "Backlog", position: 0, role: "backlog" },
						{ name: "Up Next", position: 1, role: "todo" },
						{ name: "Done", position: 2, role: "done" },
					],
				},
			},
		});
		const ran3 = await runMigration(board2.id);
		ran3 ? pass("empty Up Next case: migration ran") : fail("empty Up Next case skipped wrongly");

		const post2 = await db.board.findUniqueOrThrow({
			where: { id: board2.id },
			include: { columns: true },
		});
		post2.columns.length === 2 && !post2.columns.find((c) => c.role === "todo")
			? pass("empty Up Next column removed cleanly")
			: fail("empty Up Next column not removed");
	} finally {
		await db.project.delete({ where: { id: project.id } });
	}

	if (failures > 0) {
		console.error(`\n${failures} failure(s)`);
		process.exit(1);
	}
	console.log("\nAll remove-up-next migration smoke checks passed.");
}

main()
	.catch((e) => {
		console.error("Unhandled error:", e);
		process.exit(1);
	})
	.finally(async () => {
		await db.$disconnect();
	});
