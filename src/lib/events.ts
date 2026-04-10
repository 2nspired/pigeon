/**
 * In-memory event bus for real-time board updates via SSE.
 * Bridges tRPC mutations (instant) and MCP changes (detected via polling).
 */

import "server-only";
import { EventEmitter } from "node:events";
import { db } from "@/server/db";

// ── Event Types ─────────────────────────────────────────────────────

export interface BoardEvent {
	boardId: string;
	type: "board:changed" | "card:changed" | "activity:new";
	entityId?: string;
}

// ── Event Bus Singleton (survives HMR) ──────────────────────────────

const g = globalThis as unknown as { __boardEventBus?: EventEmitter };
if (!g.__boardEventBus) {
	g.__boardEventBus = new EventEmitter();
}
export const eventBus = g.__boardEventBus;
eventBus.setMaxListeners(100);

export function emitBoardEvent(boardId: string, type: BoardEvent["type"], entityId?: string) {
	eventBus.emit("board-event", { boardId, type, entityId } satisfies BoardEvent);
}

// ── BoardId Resolution Helpers ──────────────────────────────────────

async function boardIdForColumn(columnId: string): Promise<string | null> {
	try {
		const col = await db.column.findUnique({
			where: { id: columnId },
			select: { boardId: true },
		});
		return col?.boardId ?? null;
	} catch {
		return null;
	}
}

async function boardIdForCard(cardId: string): Promise<string | null> {
	try {
		const card = await db.card.findUnique({
			where: { id: cardId },
			select: { column: { select: { boardId: true } } },
		});
		return card?.column.boardId ?? null;
	} catch {
		return null;
	}
}

// ── Fire-and-Forget Emit Helpers ────────────────────────────────────

/** Emit card:changed — resolves boardId from card's column */
export function emitCardChanged(cardId: string) {
	void boardIdForCard(cardId).then((bid) => {
		if (bid) emitBoardEvent(bid, "card:changed", cardId);
	});
}

/** Emit card:changed — resolves boardId from columnId (use when cardId unavailable) */
export function emitCardChangedViaColumn(columnId: string) {
	void boardIdForColumn(columnId).then((bid) => {
		if (bid) emitBoardEvent(bid, "card:changed");
	});
}

/** Emit board:changed — resolves boardId from column */
export function emitColumnChanged(columnId: string) {
	void boardIdForColumn(columnId).then((bid) => {
		if (bid) emitBoardEvent(bid, "board:changed", columnId);
	});
}
