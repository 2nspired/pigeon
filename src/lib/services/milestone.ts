/**
 * Shared milestone service.
 *
 * Both the Next.js web server (tRPC milestone router) and the MCP
 * process (taxonomy-utils, milestone-tools, utils helper) need the same
 * milestone CRUD + governance logic. Each process owns its own
 * `PrismaClient`, so this module exports a `createMilestoneService(prisma)`
 * factory rather than a singleton — mirrors the
 * `src/lib/services/staleness.ts` and `src/lib/services/tag.ts` patterns
 * and satisfies the v6.2 decision that `src/server/` and `src/mcp/`
 * never import from each other (see `scripts/boundary-lint.ts`).
 *
 * The web-side singleton bound to the FTS-extended db lives in the shim
 * at `src/server/services/milestone-service.ts`. MCP callers construct
 * their own instance via `createMilestoneService(mcpDb)`.
 */

import type { Milestone, PrismaClient } from "prisma/generated/client";
import { getHorizon } from "@/lib/column-roles";
import type {
	CreateMilestoneInput,
	ReorderMilestonesInput,
	UpdateMilestoneInput,
} from "@/lib/schemas/milestone-schemas";
import { editDistance, slugify } from "@/lib/slugify";
import type { ServiceResult } from "@/server/services/types/service-result";

// v4.2 governance hints surfaced on `list` results, mirroring the MCP
// `listMilestones` tool. Hints are computed once and bundled with each
// milestone so the UI can render badges without a second round-trip.
//   singletonAfterDays: milestone has exactly one card and is older than
//     SINGLETON_DAYS — likely premature.
//   possibleMerge: peers within Levenshtein 2 of this milestone's slug —
//     candidates for merge to collapse near-duplicate vocabulary.
export type MilestoneGovernanceHints = {
	singletonAfterDays?: number;
	possibleMerge?: Array<{ id: string; name: string; distance: number }>;
};

export type MilestoneWithCounts = Milestone & {
	_count: { cards: number };
	cardsByStatus: { now: number; later: number; done: number };
	_governanceHints?: MilestoneGovernanceHints;
};

const SINGLETON_DAYS = 60;

export type MilestoneResolveResult = {
	id: string;
	name: string;
	created: boolean;
	// Existing milestones within Levenshtein 2 of the input slug. Empty on
	// exact (case-insensitive slug) hits and on first-time creates with no
	// near neighbours. Sorted ascending by distance.
	didYouMean: { id: string; name: string; distance: number }[];
};

// Standalone factory-style helper — exposed both as a free function
// (so MCP utilities can call it without instantiating the full service)
// and via `createMilestoneService(...).resolveOrCreate(...)` for the
// shared singleton-style API. Behaviour:
//   1. Case-insensitive lookup via `slugify()` — "Getting Started" and
//      "getting started" no longer create two milestones.
//   2. `_didYouMean` neighbours surfaced for near-miss creates so callers
//      can flag possible drift in the response payload.
export async function resolveOrCreateMilestone(
	prisma: PrismaClient,
	projectId: string,
	name: string
): Promise<ServiceResult<MilestoneResolveResult>> {
	try {
		const trimmed = name.trim();
		if (!trimmed) {
			return {
				success: false,
				error: { code: "INVALID_INPUT", message: "Milestone name cannot be empty." },
			};
		}
		const inputSlug = slugify(trimmed);
		if (!inputSlug) {
			return {
				success: false,
				error: {
					code: "INVALID_INPUT",
					message: `"${name}" must contain alphanumeric characters.`,
				},
			};
		}

		const candidates = await prisma.milestone.findMany({
			where: { projectId },
			select: { id: true, name: true },
		});

		let exact: { id: string; name: string } | null = null;
		const didYouMean: { id: string; name: string; distance: number }[] = [];
		for (const m of candidates) {
			const mSlug = slugify(m.name);
			if (mSlug === inputSlug) {
				exact = m;
				break;
			}
			const distance = editDistance(inputSlug, mSlug, 2);
			if (distance <= 2) {
				didYouMean.push({ id: m.id, name: m.name, distance });
			}
		}
		if (exact) {
			return {
				success: true,
				data: { id: exact.id, name: exact.name, created: false, didYouMean: [] },
			};
		}
		didYouMean.sort((a, b) => a.distance - b.distance);

		const maxPos = await prisma.milestone.aggregate({
			where: { projectId },
			_max: { position: true },
		});
		const created = await prisma.milestone.create({
			data: { projectId, name: trimmed, position: (maxPos._max.position ?? -1) + 1 },
		});
		return {
			success: true,
			data: { id: created.id, name: created.name, created: true, didYouMean },
		};
	} catch (error) {
		console.error("[MILESTONE_SERVICE] resolveOrCreate error:", error);
		return {
			success: false,
			error: { code: "RESOLVE_FAILED", message: "Failed to resolve or create milestone." },
		};
	}
}

// ─── Service factory ─────────────────────────────────────────────────

// Factory matches the createTagService / createClaimService convention so
// the same logic can run inside the Next.js process (with the FTS-extended
// db singleton) and inside the MCP stdio process (with its own
// better-sqlite3 client).
export function createMilestoneService(prisma: PrismaClient) {
	async function list(projectId: string): Promise<ServiceResult<MilestoneWithCounts[]>> {
		try {
			const milestones = await prisma.milestone.findMany({
				where: { projectId },
				orderBy: { position: "asc" },
				include: {
					_count: { select: { cards: true } },
					cards: {
						select: {
							column: { select: { name: true, role: true, isParking: true } },
						},
					},
				},
			});

			// Pre-compute slugs once so the hint-computation pass is O(n²) without
			// touching the slugify function repeatedly. n is the per-project
			// milestone count (typically <20), well within budget.
			const slugged = milestones.map((m) => ({
				id: m.id,
				name: m.name,
				slug: slugify(m.name),
			}));
			const NOW = Date.now();

			const data = milestones.map((m, i) => {
				const cardsByStatus = { now: 0, later: 0, done: 0 };
				for (const card of m.cards) {
					cardsByStatus[getHorizon(card.column)]++;
				}
				const { cards: _, ...rest } = m;

				const total = m._count.cards;
				const ageDays = Math.floor((NOW - m.createdAt.getTime()) / (1000 * 60 * 60 * 24));
				const possibleMerge: Array<{ id: string; name: string; distance: number }> = [];
				const mineSlug = slugged[i].slug;
				if (mineSlug) {
					for (let j = 0; j < slugged.length; j++) {
						if (j === i) continue;
						const other = slugged[j];
						if (!other.slug) continue;
						const distance = editDistance(mineSlug, other.slug, 2);
						if (distance <= 2) {
							possibleMerge.push({ id: other.id, name: other.name, distance });
						}
					}
					possibleMerge.sort((a, b) => a.distance - b.distance);
				}

				const hints: MilestoneGovernanceHints = {};
				if (total === 1 && ageDays > SINGLETON_DAYS) {
					hints.singletonAfterDays = ageDays;
				}
				if (possibleMerge.length > 0) {
					hints.possibleMerge = possibleMerge;
				}

				return {
					...rest,
					cardsByStatus,
					...(Object.keys(hints).length > 0 && { _governanceHints: hints }),
				};
			});

			return { success: true, data };
		} catch (error) {
			console.error("[MILESTONE_SERVICE] list error:", error);
			return {
				success: false,
				error: { code: "LIST_FAILED", message: "Failed to fetch milestones." },
			};
		}
	}

	async function getById(milestoneId: string): Promise<
		ServiceResult<
			Milestone & {
				cards: Array<{ id: string; title: string; number: number; priority: string }>;
			}
		>
	> {
		try {
			const milestone = await prisma.milestone.findUnique({
				where: { id: milestoneId },
				include: {
					cards: {
						select: { id: true, title: true, number: true, priority: true },
						orderBy: { position: "asc" },
					},
				},
			});
			if (!milestone) {
				return { success: false, error: { code: "NOT_FOUND", message: "Milestone not found." } };
			}
			return { success: true, data: milestone };
		} catch (error) {
			console.error("[MILESTONE_SERVICE] getById error:", error);
			return {
				success: false,
				error: { code: "GET_FAILED", message: "Failed to fetch milestone." },
			};
		}
	}

	async function create(data: CreateMilestoneInput): Promise<ServiceResult<Milestone>> {
		try {
			// Auto-assign position if not provided
			let position = data.position;
			if (position === undefined) {
				const max = await prisma.milestone.aggregate({
					where: { projectId: data.projectId },
					_max: { position: true },
				});
				position = (max._max.position ?? -1) + 1;
			}

			const milestone = await prisma.milestone.create({
				data: {
					projectId: data.projectId,
					name: data.name,
					description: data.description,
					targetDate: data.targetDate ? new Date(data.targetDate) : undefined,
					position,
				},
			});
			return { success: true, data: milestone };
		} catch (error) {
			console.error("[MILESTONE_SERVICE] create error:", error);
			return {
				success: false,
				error: { code: "CREATE_FAILED", message: "Failed to create milestone." },
			};
		}
	}

	async function update(
		milestoneId: string,
		data: UpdateMilestoneInput
	): Promise<ServiceResult<Milestone>> {
		try {
			const existing = await prisma.milestone.findUnique({ where: { id: milestoneId } });
			if (!existing) {
				return { success: false, error: { code: "NOT_FOUND", message: "Milestone not found." } };
			}

			const milestone = await prisma.milestone.update({
				where: { id: milestoneId },
				data: {
					name: data.name,
					description: data.description,
					targetDate:
						data.targetDate !== undefined
							? data.targetDate
								? new Date(data.targetDate)
								: null
							: undefined,
					position: data.position,
					state: data.state,
				},
			});
			return { success: true, data: milestone };
		} catch (error) {
			console.error("[MILESTONE_SERVICE] update error:", error);
			return {
				success: false,
				error: { code: "UPDATE_FAILED", message: "Failed to update milestone." },
			};
		}
	}

	async function reorder(data: ReorderMilestonesInput): Promise<ServiceResult<boolean>> {
		try {
			const updates = data.orderedIds.map((id, i) =>
				prisma.milestone.update({ where: { id }, data: { position: i } })
			);
			await prisma.$transaction(updates);
			return { success: true, data: true };
		} catch (error) {
			console.error("[MILESTONE_SERVICE] reorder error:", error);
			return {
				success: false,
				error: { code: "REORDER_FAILED", message: "Failed to reorder milestones." },
			};
		}
	}

	async function merge(input: {
		fromMilestoneId: string;
		intoMilestoneId: string;
	}): Promise<ServiceResult<{ rewroteCount: number; projectId: string }>> {
		try {
			if (input.fromMilestoneId === input.intoMilestoneId) {
				return {
					success: false,
					error: { code: "INVALID_INPUT", message: "Cannot merge a milestone into itself." },
				};
			}
			const result = await prisma.$transaction(async (tx) => {
				const [from, into] = await Promise.all([
					tx.milestone.findUnique({ where: { id: input.fromMilestoneId } }),
					tx.milestone.findUnique({ where: { id: input.intoMilestoneId } }),
				]);
				if (!from || !into) {
					throw new Error("One or both milestones not found.");
				}
				if (from.projectId !== into.projectId) {
					throw new Error("Cannot merge milestones across projects.");
				}
				const update = await tx.card.updateMany({
					where: { milestoneId: input.fromMilestoneId },
					data: { milestoneId: input.intoMilestoneId },
				});
				await tx.milestone.delete({ where: { id: input.fromMilestoneId } });
				return { rewroteCount: update.count, projectId: from.projectId };
			});
			return { success: true, data: result };
		} catch (error) {
			console.error("[MILESTONE_SERVICE] merge error:", error);
			return {
				success: false,
				error: {
					code: "MERGE_FAILED",
					message: error instanceof Error ? error.message : "Failed to merge milestones.",
				},
			};
		}
	}

	async function deleteMilestone(milestoneId: string): Promise<ServiceResult<Milestone>> {
		try {
			const existing = await prisma.milestone.findUnique({ where: { id: milestoneId } });
			if (!existing) {
				return { success: false, error: { code: "NOT_FOUND", message: "Milestone not found." } };
			}

			const milestone = await prisma.milestone.delete({ where: { id: milestoneId } });
			return { success: true, data: milestone };
		} catch (error) {
			console.error("[MILESTONE_SERVICE] delete error:", error);
			return {
				success: false,
				error: { code: "DELETE_FAILED", message: "Failed to delete milestone." },
			};
		}
	}

	// Singleton-style method for tRPC callers — wraps the standalone
	// `resolveOrCreateMilestone` factory function with the bound prisma.
	// MCP callers can call the standalone export directly with their own
	// PrismaClient.
	async function resolveOrCreate(projectId: string, name: string) {
		return resolveOrCreateMilestone(prisma, projectId, name);
	}

	return {
		list,
		getById,
		create,
		update,
		reorder,
		resolveOrCreate,
		merge,
		delete: deleteMilestone,
	};
}

export type MilestoneService = ReturnType<typeof createMilestoneService>;
