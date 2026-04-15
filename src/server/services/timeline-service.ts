import type { ServiceResult } from "@/server/services/types/service-result";
import { activityService } from "@/server/services/activity-service";
import { handoffService } from "@/server/services/handoff-service";
import { decisionService } from "@/server/services/decision-service";

// ─── Timeline Event Types ─────────────────────────────────────────

export type ActivityEvent = {
	type: "activity";
	id: string;
	createdAt: Date;
	actorType: string;
	actorName: string | null;
	action: string;
	details: string | null;
	card: { id: string; number: number; title: string };
};

export type HandoffEvent = {
	type: "handoff";
	id: string;
	createdAt: Date;
	agentName: string;
	summary: string;
	workingOn: string[];
	nextSteps: string[];
	blockers: string[];
};

export type DecisionEvent = {
	type: "decision";
	id: string;
	createdAt: Date;
	title: string;
	status: string;
	decision: string;
	author: string;
	card: { id: string; number: number; title: string } | null;
};

export type TimelineEvent = ActivityEvent | HandoffEvent | DecisionEvent;

// ─── Service ──────────────────────────────────────────────────────

async function listByBoard(
	boardId: string,
	projectId: string,
	limit = 50,
): Promise<ServiceResult<TimelineEvent[]>> {
	try {
		// Fan out all three queries concurrently — partial failures are tolerated
		const [activitiesResult, handoffsResult, decisionsResult] = await Promise.all([
			activityService.listByBoard(boardId, limit),
			handoffService.list(boardId, Math.min(limit, 20)),
			decisionService.list(projectId),
		]);

		const events: TimelineEvent[] = [];

		if (activitiesResult.success) {
			for (const a of activitiesResult.data) {
				events.push({
					type: "activity",
					id: a.id,
					createdAt: a.createdAt,
					actorType: a.actorType,
					actorName: a.actorName,
					action: a.action,
					details: a.details,
					card: a.card,
				});
			}
		} else {
			console.error("[TIMELINE_SERVICE] activities fetch failed:", activitiesResult.error.message);
		}

		if (handoffsResult.success) {
			for (const h of handoffsResult.data) {
				events.push({
					type: "handoff",
					id: h.id,
					createdAt: h.createdAt,
					agentName: h.agentName,
					summary: h.summary,
					workingOn: h.workingOn,
					nextSteps: h.nextSteps,
					blockers: h.blockers,
				});
			}
		} else {
			console.error("[TIMELINE_SERVICE] handoffs fetch failed:", handoffsResult.error.message);
		}

		if (decisionsResult.success) {
			// Decisions are project-scoped (no boardId filter in schema), so cap volume
			const recentDecisions = decisionsResult.data.slice(0, limit);
			for (const d of recentDecisions) {
				if (d.status === "superseded") continue;
				events.push({
					type: "decision",
					id: d.id,
					createdAt: d.createdAt,
					title: d.title,
					status: d.status,
					decision: d.decision,
					author: d.author,
					card: d.card,
				});
			}
		} else {
			console.error("[TIMELINE_SERVICE] decisions fetch failed:", decisionsResult.error.message);
		}

		// All three failed — report a real error
		if (!activitiesResult.success && !handoffsResult.success && !decisionsResult.success) {
			return { success: false, error: { code: "FETCH_FAILED", message: "All timeline sources failed." } };
		}

		events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

		return { success: true, data: events.slice(0, limit) };
	} catch (error) {
		console.error("[TIMELINE_SERVICE] listByBoard error:", error);
		return { success: false, error: { code: "FETCH_FAILED", message: "Failed to fetch timeline." } };
	}
}

export const timelineService = {
	listByBoard,
};
