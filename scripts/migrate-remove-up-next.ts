#!/usr/bin/env tsx

/**
 * Migration: remove the "Up Next" column from every board.
 *
 * For each board with a column where role="todo" (or name="Up Next" as
 * fallback for legacy boards):
 *   1. Move its cards to the TOP of the Backlog column on the same board,
 *      preserving relative order. Existing Backlog cards shift down.
 *   2. Delete the now-empty Up Next column.
 *   3. Re-position remaining columns so positions are contiguous from 0.
 *
 * Idempotent: a board with no Up Next column is silently skipped. Safe to
 * re-run.
 *
 * Run: `tsx scripts/migrate-remove-up-next.ts`
 *   --dry-run  : print plan, make no writes
 */

import { db } from "../src/server/db.js";

const DRY_RUN = process.argv.includes("--dry-run");

interface MigrationReport {
	boardId: string;
	boardName: string;
	projectName: string | null;
	upNextCardCount: number;
	movedCards: { number: number; title: string; oldPosition: number; newPosition: number }[];
	skipped?: string;
}

async function main() {
	const boards = await db.board.findMany({
		include: {
			project: { select: { name: true } },
			columns: { include: { cards: { orderBy: { position: "asc" } } }, orderBy: { position: "asc" } },
		},
	});

	const reports: MigrationReport[] = [];

	for (const board of boards) {
		const upNextCol =
			board.columns.find((c) => c.role === "todo") ??
			board.columns.find((c) => c.name === "Up Next");

		if (!upNextCol) {
			continue;
		}

		const backlogCol =
			board.columns.find((c) => c.role === "backlog") ??
			board.columns.find((c) => c.name === "Backlog");

		const report: MigrationReport = {
			boardId: board.id,
			boardName: board.name,
			projectName: board.project?.name ?? null,
			upNextCardCount: upNextCol.cards.length,
			movedCards: [],
		};

		if (!backlogCol) {
			report.skipped = "no Backlog column on this board — cannot migrate";
			reports.push(report);
			continue;
		}

		const upNextCards = upNextCol.cards;
		const backlogCards = backlogCol.cards;
		const shift = upNextCards.length;

		report.movedCards = upNextCards.map((c, i) => ({
			number: c.number,
			title: c.title,
			oldPosition: c.position,
			newPosition: i,
		}));

		if (DRY_RUN) {
			reports.push(report);
			continue;
		}

		await db.$transaction(async (tx) => {
			// Step 1: shift existing Backlog cards down by `shift` positions
			// to make room at the top. Iterate in reverse to avoid unique-index
			// collisions if (columnId, position) is ever constrained.
			for (let i = backlogCards.length - 1; i >= 0; i--) {
				const card = backlogCards[i];
				await tx.card.update({
					where: { id: card.id },
					data: { position: card.position + shift },
				});
			}

			// Step 2: move Up Next cards into Backlog at positions 0..N-1.
			for (let i = 0; i < upNextCards.length; i++) {
				const card = upNextCards[i];
				await tx.card.update({
					where: { id: card.id },
					data: { columnId: backlogCol.id, position: i },
				});
			}

			// Step 3: delete the now-empty Up Next column.
			await tx.column.delete({ where: { id: upNextCol.id } });

			// Step 4: re-position remaining columns to be contiguous from 0.
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

		reports.push(report);
	}

	if (reports.length === 0) {
		console.log("No boards have an Up Next column. Nothing to migrate.");
		return;
	}

	const verb = DRY_RUN ? "Would migrate" : "Migrated";
	console.log(`${verb} ${reports.length} board(s):\n`);
	for (const r of reports) {
		console.log(`  ${r.projectName ?? "<orphaned project>"} / ${r.boardName} (${r.boardId})`);
		if (r.skipped) {
			console.log(`    SKIPPED: ${r.skipped}`);
			continue;
		}
		console.log(`    ${r.upNextCardCount} card(s) moved Up Next → top of Backlog:`);
		for (const c of r.movedCards) {
			console.log(`      #${c.number} "${c.title}"  (pos ${c.oldPosition} → ${c.newPosition})`);
		}
	}

	if (DRY_RUN) {
		console.log("\nDry run — no writes performed. Re-run without --dry-run to apply.");
	} else {
		console.log("\nMigration complete.");
	}
}

main()
	.catch((e) => {
		console.error("Migration failed:", e);
		process.exit(1);
	})
	.finally(async () => {
		await db.$disconnect();
	});
