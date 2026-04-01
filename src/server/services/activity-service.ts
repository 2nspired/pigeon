import type { Activity } from "prisma/generated/client";
import { db } from "@/server/db";
import type { ServiceResult } from "@/server/services/types/service-result";

async function listByCard(cardId: string): Promise<ServiceResult<Activity[]>> {
	try {
		const activities = await db.activity.findMany({
			where: { cardId },
			orderBy: { createdAt: "desc" },
		});
		return { success: true, data: activities };
	} catch (error) {
		console.error("[ACTIVITY_SERVICE] listByCard error:", error);
		return { success: false, error: { code: "LIST_FAILED", message: "Failed to fetch activities." } };
	}
}

async function listByBoard(boardId: string, limit = 30): Promise<ServiceResult<Array<Activity & { card: { id: string; number: number; title: string } }>>> {
	try {
		const activities = await db.activity.findMany({
			where: {
				card: { column: { boardId } },
			},
			include: {
				card: { select: { id: true, number: true, title: true } },
			},
			orderBy: { createdAt: "desc" },
			take: limit,
		});
		return { success: true, data: activities };
	} catch (error) {
		console.error("[ACTIVITY_SERVICE] listByBoard error:", error);
		return { success: false, error: { code: "LIST_FAILED", message: "Failed to fetch activities." } };
	}
}

async function log(data: {
	cardId: string;
	action: string;
	details?: string;
	actorType: string;
	actorName?: string;
}): Promise<void> {
	try {
		await db.activity.create({ data });
	} catch (error) {
		console.error("[ACTIVITY_SERVICE] log error:", error);
	}
}

export const activityService = {
	listByCard,
	listByBoard,
	log,
};
