/**
 * Shared handoff (session continuity) logic.
 *
 * Post-cutover (commit 5 of docs/IMPL-NOTE-CLAIM-CUTOVER.md) readers
 * pull from Note(kind="handoff"). `saveHandoff` still writes the
 * legacy SessionHandoff table until commit 6 aliases the write path;
 * callers must not assume write-then-read round-trips through the new
 * table until that lands.
 */

import type { Note, PrismaClient, SessionHandoff } from "prisma/generated/client";

export type ParsedHandoff = {
	id: string;
	boardId: string | null;
	agentName: string;
	summary: string;
	workingOn: string[];
	findings: string[];
	nextSteps: string[];
	blockers: string[];
	createdAt: Date;
	updatedAt: Date;
};

type HandoffMetadata = {
	workingOn?: string[];
	findings?: string[];
	nextSteps?: string[];
	blockers?: string[];
};

export function parseHandoff(note: Note): ParsedHandoff {
	const metadata = JSON.parse(note.metadata || "{}") as HandoffMetadata;
	return {
		id: note.id,
		boardId: note.boardId,
		agentName: note.author,
		summary: note.content,
		workingOn: metadata.workingOn ?? [],
		findings: metadata.findings ?? [],
		nextSteps: metadata.nextSteps ?? [],
		blockers: metadata.blockers ?? [],
		createdAt: note.createdAt,
		updatedAt: note.updatedAt,
	};
}

export async function saveHandoff(
	db: PrismaClient,
	input: {
		boardId: string;
		agentName: string;
		workingOn: string[];
		findings: string[];
		nextSteps: string[];
		blockers: string[];
		summary: string;
	}
): Promise<SessionHandoff> {
	return db.sessionHandoff.create({
		data: {
			boardId: input.boardId,
			agentName: input.agentName,
			workingOn: JSON.stringify(input.workingOn),
			findings: JSON.stringify(input.findings),
			nextSteps: JSON.stringify(input.nextSteps),
			blockers: JSON.stringify(input.blockers),
			summary: input.summary,
		},
	});
}

export async function getLatestHandoff(db: PrismaClient, boardId: string): Promise<Note | null> {
	return db.note.findFirst({
		where: { kind: "handoff", boardId },
		orderBy: { createdAt: "desc" },
	});
}

export async function listHandoffs(db: PrismaClient, boardId: string, limit = 10): Promise<Note[]> {
	return db.note.findMany({
		where: { kind: "handoff", boardId },
		orderBy: { createdAt: "desc" },
		take: limit,
	});
}
