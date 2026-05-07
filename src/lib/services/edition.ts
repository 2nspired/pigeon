/**
 * The Daily Squawk — edition service (#298).
 *
 * Pure business logic for the newspaper-style activity digest:
 *   - `getActivityWindow` collates the raw signals an Edith-class agent
 *     needs to draft an issue (shipped/in-progress/blocked cards, comments,
 *     handoffs, stale-backlog cards, financial rollup, velocity, deletions).
 *   - `publishEdition` persists a drafted issue. Editions are immutable —
 *     a duplicate slug returns the existing edition's id rather than
 *     overwriting (matches the architectural decision in the card plan).
 *   - `getEdition` / `listEditions` back the web reader and morgue archive.
 *
 * Layer rule: factory pattern. No tRPC, no Next, no MCP SDK imports —
 * the boundary lint enforces it. Both the Next.js shim
 * (`src/server/services/edition-service.ts`) and the MCP tool
 * (`src/mcp/tools/squawk-tools.ts`) bind this against their own Prisma
 * client.
 */

import type { PrismaClient } from "prisma/generated/client";
import { hasRole } from "@/lib/column-roles";
import type { ServiceResult } from "@/server/services/types/service-result";

// ─── Types ─────────────────────────────────────────────────────────

export type ActivityCard = {
	id: string;
	number: number;
	title: string;
	columnName: string;
	columnRole: string | null;
	priority: string;
	updatedAt: Date;
	completedAt: Date | null;
	tags: string[];
	milestoneName: string | null;
};

export type ActivityComment = {
	id: string;
	cardId: string;
	cardNumber: number;
	cardTitle: string;
	authorName: string | null;
	authorType: string;
	content: string;
	createdAt: Date;
};

export type ActivityHandoff = {
	id: string;
	agentName: string;
	summary: string;
	workingOn: string[];
	findings: string[];
	nextSteps: string[];
	blockers: string[];
	createdAt: Date;
};

export type StaleBacklogCard = {
	id: string;
	number: number;
	title: string;
	columnName: string;
	updatedAt: Date;
	daysStale: number;
};

export type GitDeletion = {
	commitHash: string;
	commitDate: Date;
	author: string;
	filePath: string;
	cardNumber: number;
	cardTitle: string;
};

export type FinancialModel = {
	model: string;
	costUsd: number;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
};

export type FinancialTopCard = {
	cardId: string;
	cardRef: string;
	cardTitle: string;
	costUsd: number;
};

export type FinancialData = {
	totalCostUsd: number;
	byModel: FinancialModel[];
	topSpendingCards: FinancialTopCard[];
};

export type VelocityStats = {
	cardsCompleted: number;
	cardsInProgress: number;
	cardsBlocked: number;
	medianCycleTimeHours: number | null;
	leadingScorerCard: { number: number; title: string; commits: number } | null;
};

export type CorrectionEntry = {
	cardId: string;
	cardNumber: number;
	cardTitle: string;
	movedFromDoneAt: Date;
};

export type ActivityWindow = {
	periodStart: Date;
	periodEnd: Date;
	completedCards: ActivityCard[];
	inProgressCards: ActivityCard[];
	blockedCards: ActivityCard[];
	comments: ActivityComment[];
	handoffs: ActivityHandoff[];
	latestHandoff: ActivityHandoff | null;
	staleBacklogCards: StaleBacklogCard[];
	gitLinksInPeriod: GitDeletion[];
	corrections: CorrectionEntry[];
	financialData: FinancialData;
	velocityStats: VelocityStats;
};

export type Masthead = {
	editorName: string;
	volume: string;
	issue: number;
};

export type ParsedEdition = {
	id: string;
	boardId: string;
	projectId: string;
	slug: string;
	masthead: Masthead;
	content: string;
	periodStart: Date;
	periodEnd: Date;
	generatedAt: Date;
	url: string;
};

export type PublishResult = {
	id: string;
	slug: string;
	url: string;
	created: boolean;
};

// ─── Pure helpers (exported for tests) ────────────────────────────

/**
 * Build a deterministic per-board slug from the period end and a kind.
 * Keys off the *end* of the period so a re-run on the same day collides
 * regardless of timeframe (`/squawk 1d` and `/squawk 7d` on the same
 * morning yield the same slug, both resolve to the same edition).
 */
export function buildSlug(periodEnd: Date): string {
	const yyyy = periodEnd.getUTCFullYear();
	const mm = String(periodEnd.getUTCMonth() + 1).padStart(2, "0");
	const dd = String(periodEnd.getUTCDate()).padStart(2, "0");
	return `${yyyy}-${mm}-${dd}-daily-squawk`;
}

/** Roman-numeral helper for the masthead `Vol. III` chrome. */
export function toRoman(n: number): string {
	if (n <= 0 || n > 3999) return String(n);
	const numerals: Array<[number, string]> = [
		[1000, "M"],
		[900, "CM"],
		[500, "D"],
		[400, "CD"],
		[100, "C"],
		[90, "XC"],
		[50, "L"],
		[40, "XL"],
		[10, "X"],
		[9, "IX"],
		[5, "V"],
		[4, "IV"],
		[1, "I"],
	];
	let out = "";
	let rem = n;
	for (const [val, sym] of numerals) {
		while (rem >= val) {
			out += sym;
			rem -= val;
		}
	}
	return out;
}

/** Compute the next issue number for a board (count + 1). */
export async function nextIssueNumber(prisma: PrismaClient, boardId: string): Promise<number> {
	const count = await prisma.edition.count({ where: { boardId } });
	return count + 1;
}

/**
 * Volume bucket: every 12 issues = a new volume. So volumes line up with
 * a "year of weeks" mental model without coupling to wall time. `Vol. I`
 * is issues 1-12, `Vol. II` is 13-24, etc.
 */
export function volumeForIssue(issue: number): string {
	const vol = Math.max(1, Math.ceil(issue / 12));
	return toRoman(vol);
}

/** Median of an array of numbers (used for cycle time). Returns null on empty. */
export function median(xs: number[]): number | null {
	if (xs.length === 0) return null;
	const sorted = [...xs].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function hoursBetween(a: Date, b: Date): number {
	return Math.abs(a.getTime() - b.getTime()) / 3_600_000;
}

function safeJsonArray(raw: string): string[] {
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
	} catch {
		return [];
	}
}

function parseMasthead(raw: string): Masthead {
	try {
		const parsed = JSON.parse(raw);
		if (
			parsed &&
			typeof parsed === "object" &&
			typeof parsed.editorName === "string" &&
			typeof parsed.volume === "string" &&
			typeof parsed.issue === "number"
		) {
			return parsed as Masthead;
		}
	} catch {
		// fall through
	}
	// Fallback: a stable degenerate masthead so the reader doesn't 500
	// on a hand-edited row. Real publishEdition writes a valid one.
	return { editorName: "Edith Featherstone", volume: "I", issue: 1 };
}

// ─── Service factory ──────────────────────────────────────────────

export function createEditionService(prisma: PrismaClient) {
	// ─── Internal: load tag labels for a list of card ids ────────
	async function loadTagsForCards(cardIds: string[]): Promise<Map<string, string[]>> {
		if (cardIds.length === 0) return new Map();
		const rows = await prisma.cardTag.findMany({
			where: { cardId: { in: cardIds } },
			select: { cardId: true, tag: { select: { label: true } } },
		});
		const out = new Map<string, string[]>();
		for (const row of rows) {
			const list = out.get(row.cardId) ?? [];
			list.push(row.tag.label);
			out.set(row.cardId, list);
		}
		return out;
	}

	function hydrateCard(
		row: {
			id: string;
			number: number;
			title: string;
			priority: string;
			updatedAt: Date;
			completedAt: Date | null;
			column: { name: string; role: string | null };
			milestone: { name: string } | null;
		},
		tagsByCard: Map<string, string[]>
	): ActivityCard {
		return {
			id: row.id,
			number: row.number,
			title: row.title,
			columnName: row.column.name,
			columnRole: row.column.role,
			priority: row.priority,
			updatedAt: row.updatedAt,
			completedAt: row.completedAt,
			tags: tagsByCard.get(row.id) ?? [],
			milestoneName: row.milestone?.name ?? null,
		};
	}

	// ─── Internal: financial rollup (#292 primitive) ─────────────
	//
	// Aggregates token-usage events for the project in the period window
	// into the trio Sterling Goldfeather needs: per-model totals,
	// top-spending cards, total. Pricing is loaded from AppSettings;
	// fall-back to a zero pricing map if it can't be parsed (no crash —
	// Sterling will print zeros, the section's still rendered).
	async function loadPricing(): Promise<Record<string, ModelPricing>> {
		const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
		if (!settings) return {};
		try {
			const parsed = JSON.parse(settings.tokenPricing) as unknown;
			if (parsed && typeof parsed === "object") {
				return parsed as Record<string, ModelPricing>;
			}
		} catch {
			// fall through
		}
		return {};
	}

	function costForEvent(
		event: {
			model: string;
			inputTokens: number;
			outputTokens: number;
			cacheReadTokens: number;
			cacheCreation1hTokens: number;
			cacheCreation5mTokens: number;
		},
		pricing: Record<string, ModelPricing>
	): number {
		const p = pricing[event.model] ?? pricing.__default__ ?? ZERO_PRICING;
		const m = 1_000_000;
		return (
			(event.inputTokens * (p.inputPerMTok ?? 0)) / m +
			(event.outputTokens * (p.outputPerMTok ?? 0)) / m +
			(event.cacheReadTokens * (p.cacheReadPerMTok ?? 0)) / m +
			(event.cacheCreation1hTokens * (p.cacheCreation1hPerMTok ?? 0)) / m +
			(event.cacheCreation5mTokens * (p.cacheCreation5mPerMTok ?? 0)) / m
		);
	}

	async function getFinancialData(
		projectId: string,
		periodStart: Date,
		periodEnd: Date
	): Promise<FinancialData> {
		const events = await prisma.tokenUsageEvent.findMany({
			where: {
				projectId,
				recordedAt: { gte: periodStart, lte: periodEnd },
			},
			select: {
				cardId: true,
				model: true,
				inputTokens: true,
				outputTokens: true,
				cacheReadTokens: true,
				cacheCreation1hTokens: true,
				cacheCreation5mTokens: true,
			},
		});

		const pricing = await loadPricing();

		type Acc = {
			model: string;
			costUsd: number;
			inputTokens: number;
			outputTokens: number;
			cacheReadTokens: number;
		};
		const byModelMap = new Map<string, Acc>();
		const byCardMap = new Map<string, number>();
		let total = 0;

		for (const event of events) {
			const cost = costForEvent(event, pricing);
			total += cost;
			const acc = byModelMap.get(event.model) ?? {
				model: event.model,
				costUsd: 0,
				inputTokens: 0,
				outputTokens: 0,
				cacheReadTokens: 0,
			};
			acc.costUsd += cost;
			acc.inputTokens += event.inputTokens;
			acc.outputTokens += event.outputTokens;
			acc.cacheReadTokens += event.cacheReadTokens;
			byModelMap.set(event.model, acc);

			if (event.cardId) {
				byCardMap.set(event.cardId, (byCardMap.get(event.cardId) ?? 0) + cost);
			}
		}

		const byModel = Array.from(byModelMap.values()).sort((a, b) => b.costUsd - a.costUsd);

		// Hydrate top spenders' card refs.
		const topCardIds = Array.from(byCardMap.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5)
			.map(([id]) => id);
		const cardRows =
			topCardIds.length > 0
				? await prisma.card.findMany({
						where: { id: { in: topCardIds } },
						select: { id: true, number: true, title: true },
					})
				: [];
		const cardMeta = new Map(cardRows.map((c) => [c.id, c]));
		const topSpendingCards: FinancialTopCard[] = topCardIds
			.map((id) => {
				const meta = cardMeta.get(id);
				if (!meta) return null;
				return {
					cardId: id,
					cardRef: `#${meta.number}`,
					cardTitle: meta.title,
					costUsd: byCardMap.get(id) ?? 0,
				};
			})
			.filter((x): x is FinancialTopCard => x !== null);

		return {
			totalCostUsd: total,
			byModel,
			topSpendingCards,
		};
	}

	// ─── Internal: corrections (Done → In Progress in the period) ─
	//
	// Reads the `activity` table for `move` rows whose details capture a
	// transition out of a Done-role column. We don't have a structured
	// from-column field in the activity table, so we rely on `details`
	// containing the previous column name. Best-effort — if no match,
	// returns an empty list and the Corrections box stays hidden.
	async function detectCorrections(
		boardId: string,
		periodStart: Date,
		periodEnd: Date
	): Promise<CorrectionEntry[]> {
		// Resolve all column ids with Done role on the board (and "Done"
		// name fallback for legacy schemas).
		const columns = await prisma.column.findMany({
			where: { boardId },
			select: { id: true, name: true, role: true },
		});
		const doneColumnNames = new Set(
			columns.filter((c) => hasRole(c, "done")).map((c) => c.name.toLowerCase())
		);
		if (doneColumnNames.size === 0) return [];

		// Load all `move` activity in the period for any card on the board.
		// Then keep rows where details mention "from <Done>" or similar.
		const cardIds = (
			await prisma.card.findMany({
				where: { column: { boardId } },
				select: { id: true },
			})
		).map((c) => c.id);
		if (cardIds.length === 0) return [];

		const activity = await prisma.activity.findMany({
			where: {
				cardId: { in: cardIds },
				action: "move",
				createdAt: { gte: periodStart, lte: periodEnd },
			},
			orderBy: { createdAt: "asc" },
			select: {
				id: true,
				cardId: true,
				details: true,
				createdAt: true,
			},
		});

		// Heuristic: details often look like "Moved from Done to In Progress"
		// or "Moved from Done → In Progress". Match a Done-role column name
		// case-insensitively. For each card, keep the latest such transition
		// in the window — that's what shows up in the next morning's box.
		const candidatesByCard = new Map<string, { details: string; createdAt: Date }>();
		for (const row of activity) {
			const details = row.details ?? "";
			const lower = details.toLowerCase();
			let matched = false;
			for (const name of doneColumnNames) {
				if (lower.includes(`from ${name}`)) {
					matched = true;
					break;
				}
			}
			if (!matched) continue;
			candidatesByCard.set(row.cardId, { details, createdAt: row.createdAt });
		}

		if (candidatesByCard.size === 0) return [];

		const cardMeta = await prisma.card.findMany({
			where: { id: { in: Array.from(candidatesByCard.keys()) } },
			select: { id: true, number: true, title: true },
		});

		return cardMeta.map((c) => ({
			cardId: c.id,
			cardNumber: c.number,
			cardTitle: c.title,
			movedFromDoneAt: candidatesByCard.get(c.id)?.createdAt ?? new Date(0),
		}));
	}

	// ─── Internal: stale backlog (≥30d, no activity, role=backlog) ─
	async function findStaleBacklogCards(boardId: string): Promise<StaleBacklogCard[]> {
		const columns = await prisma.column.findMany({
			where: { boardId },
			select: { id: true, name: true, role: true },
		});
		const backlogIds = columns
			.filter((c) => hasRole(c, "backlog") || hasRole(c, "parking"))
			.map((c) => c.id);
		if (backlogIds.length === 0) return [];

		const STALE_DAYS = 30;
		const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);

		const rows = await prisma.card.findMany({
			where: {
				columnId: { in: backlogIds },
				updatedAt: { lt: cutoff },
			},
			orderBy: { updatedAt: "asc" },
			take: 20,
			select: {
				id: true,
				number: true,
				title: true,
				updatedAt: true,
				column: { select: { name: true } },
			},
		});

		const now = Date.now();
		return rows.map((r) => ({
			id: r.id,
			number: r.number,
			title: r.title,
			columnName: r.column.name,
			updatedAt: r.updatedAt,
			daysStale: Math.floor((now - r.updatedAt.getTime()) / (24 * 60 * 60 * 1000)),
		}));
	}

	// ─── Internal: velocity stats ────────────────────────────────
	async function getVelocityStats(
		boardId: string,
		periodStart: Date,
		periodEnd: Date,
		completed: ActivityCard[],
		inProgress: ActivityCard[],
		blocked: ActivityCard[]
	): Promise<VelocityStats> {
		// Cycle time: for each completed card in the window, find its first
		// `move` activity into an In-Progress column, then compute
		// completedAt - that timestamp. Skip cards without a clean signal.
		const cycleHours: number[] = [];
		for (const card of completed) {
			if (!card.completedAt) continue;
			// Earliest move activity for this card before completion. Cheap
			// per-card fetch — completed list is small per period.
			const firstMove = await prisma.activity.findFirst({
				where: {
					cardId: card.id,
					action: "move",
					createdAt: { lte: card.completedAt },
				},
				orderBy: { createdAt: "asc" },
				select: { createdAt: true },
			});
			if (firstMove) {
				cycleHours.push(hoursBetween(card.completedAt, firstMove.createdAt));
			}
		}

		// Leading scorer: card with most git links in the period.
		const cardIdsOnBoard = (
			await prisma.card.findMany({
				where: { column: { boardId } },
				select: { id: true },
			})
		).map((c) => c.id);

		let leadingScorerCard: VelocityStats["leadingScorerCard"] = null;
		if (cardIdsOnBoard.length > 0) {
			const grouped = await prisma.gitLink.groupBy({
				by: ["cardId"],
				where: {
					cardId: { in: cardIdsOnBoard },
					commitDate: { gte: periodStart, lte: periodEnd },
				},
				_count: { _all: true },
				orderBy: { _count: { cardId: "desc" } },
				take: 1,
			});
			if (grouped.length > 0 && grouped[0]._count._all > 0) {
				const card = await prisma.card.findUnique({
					where: { id: grouped[0].cardId },
					select: { number: true, title: true },
				});
				if (card) {
					leadingScorerCard = {
						number: card.number,
						title: card.title,
						commits: grouped[0]._count._all,
					};
				}
			}
		}

		return {
			cardsCompleted: completed.length,
			cardsInProgress: inProgress.length,
			cardsBlocked: blocked.length,
			medianCycleTimeHours: median(cycleHours),
			leadingScorerCard,
		};
	}

	// ─── Public: getActivityWindow ───────────────────────────────
	async function getActivityWindow(
		boardId: string,
		projectId: string,
		periodStart: Date,
		periodEnd: Date
	): Promise<ServiceResult<ActivityWindow>> {
		try {
			// Resolve columns + roles up-front; we'll bucket cards by role.
			const columns = await prisma.column.findMany({
				where: { boardId },
				select: { id: true, name: true, role: true },
			});
			const doneIds = columns.filter((c) => hasRole(c, "done")).map((c) => c.id);
			const activeIds = columns.filter((c) => hasRole(c, "active")).map((c) => c.id);

			// Completed in the window: filter by `completedAt` (the stable
			// ship-date column added in #146-class work). Falls back to
			// `column.role === done` + `updatedAt` window if completedAt is null.
			const completedRows = await prisma.card.findMany({
				where: {
					column: { boardId },
					OR: [
						{ completedAt: { gte: periodStart, lte: periodEnd } },
						doneIds.length > 0
							? {
									columnId: { in: doneIds },
									completedAt: null,
									updatedAt: { gte: periodStart, lte: periodEnd },
								}
							: {},
					],
				},
				orderBy: { completedAt: "desc" },
				select: cardSelect,
			});

			// In-progress right now (snapshot at periodEnd — but Prisma can't
			// give us point-in-time, so we use current state). Acceptable for a
			// daily digest — same trade-off briefMe makes.
			const inProgressRows =
				activeIds.length > 0
					? await prisma.card.findMany({
							where: { columnId: { in: activeIds } },
							orderBy: { updatedAt: "desc" },
							select: cardSelect,
						})
					: [];

			// Blocked: cards with at least one `blocks` or `blocked-by` relation.
			// Treat presence of `relationsTo` of type 'blocks' as "this card is
			// blocked by something else" — i.e. another card has `to=this`
			// with type `blocks`. Cheap query, doesn't need a hot index.
			const blockedRelations = await prisma.cardRelation.findMany({
				where: {
					type: "blocks",
					toCard: { column: { boardId } },
				},
				select: { toCardId: true },
			});
			const blockedIds = Array.from(new Set(blockedRelations.map((r) => r.toCardId)));
			const blockedRows =
				blockedIds.length > 0
					? await prisma.card.findMany({
							where: { id: { in: blockedIds } },
							select: cardSelect,
						})
					: [];

			const allCardIds = Array.from(
				new Set([
					...completedRows.map((r) => r.id),
					...inProgressRows.map((r) => r.id),
					...blockedRows.map((r) => r.id),
				])
			);
			const tagsByCard = await loadTagsForCards(allCardIds);

			const completedCards = completedRows.map((r) => hydrateCard(r, tagsByCard));
			const inProgressCards = inProgressRows.map((r) => hydrateCard(r, tagsByCard));
			const blockedCards = blockedRows.map((r) => hydrateCard(r, tagsByCard));

			// Comments in the period (any card on the board).
			const commentRows = await prisma.comment.findMany({
				where: {
					createdAt: { gte: periodStart, lte: periodEnd },
					card: { column: { boardId } },
				},
				orderBy: { createdAt: "desc" },
				take: 50,
				select: {
					id: true,
					cardId: true,
					authorName: true,
					authorType: true,
					content: true,
					createdAt: true,
					card: { select: { number: true, title: true } },
				},
			});
			const comments: ActivityComment[] = commentRows.map((row) => ({
				id: row.id,
				cardId: row.cardId,
				cardNumber: row.card.number,
				cardTitle: row.card.title,
				authorName: row.authorName,
				authorType: row.authorType,
				content: row.content,
				createdAt: row.createdAt,
			}));

			// Handoffs in the period.
			const handoffRows = await prisma.handoff.findMany({
				where: {
					boardId,
					createdAt: { gte: periodStart, lte: periodEnd },
				},
				orderBy: { createdAt: "desc" },
			});
			const handoffs: ActivityHandoff[] = handoffRows.map((row) => ({
				id: row.id,
				agentName: row.agentName,
				summary: row.summary,
				workingOn: safeJsonArray(row.workingOn),
				findings: safeJsonArray(row.findings),
				nextSteps: safeJsonArray(row.nextSteps),
				blockers: safeJsonArray(row.blockers),
				createdAt: row.createdAt,
			}));

			// Latest handoff (any time) — for the Pigeon Post column.
			const latestHandoffRow = await prisma.handoff.findFirst({
				where: { boardId },
				orderBy: { createdAt: "desc" },
			});
			const latestHandoff: ActivityHandoff | null = latestHandoffRow
				? {
						id: latestHandoffRow.id,
						agentName: latestHandoffRow.agentName,
						summary: latestHandoffRow.summary,
						workingOn: safeJsonArray(latestHandoffRow.workingOn),
						findings: safeJsonArray(latestHandoffRow.findings),
						nextSteps: safeJsonArray(latestHandoffRow.nextSteps),
						blockers: safeJsonArray(latestHandoffRow.blockers),
						createdAt: latestHandoffRow.createdAt,
					}
				: null;

			const staleBacklogCards = await findStaleBacklogCards(boardId);
			const corrections = await detectCorrections(boardId, periodStart, periodEnd);
			const financialData = await getFinancialData(projectId, periodStart, periodEnd);
			const velocityStats = await getVelocityStats(
				boardId,
				periodStart,
				periodEnd,
				completedCards,
				inProgressCards,
				blockedCards
			);

			return {
				success: true,
				data: {
					periodStart,
					periodEnd,
					completedCards,
					inProgressCards,
					blockedCards,
					comments,
					handoffs,
					latestHandoff,
					staleBacklogCards,
					gitLinksInPeriod: [], // populated by callers that pass deletions in
					corrections,
					financialData,
					velocityStats,
				},
			};
		} catch (error) {
			console.error("[EDITION_SERVICE] getActivityWindow error:", error);
			return {
				success: false,
				error: { code: "QUERY_FAILED", message: "Failed to load activity window." },
			};
		}
	}

	// ─── Public: publishEdition (immutable) ──────────────────────
	async function publishEdition(input: {
		boardId: string;
		content: string;
		periodStart: Date;
		periodEnd: Date;
		masthead: Masthead;
	}): Promise<ServiceResult<PublishResult>> {
		try {
			const board = await prisma.board.findUnique({
				where: { id: input.boardId },
				select: { id: true, projectId: true },
			});
			if (!board) {
				return {
					success: false,
					error: { code: "BOARD_NOT_FOUND", message: "Board not found." },
				};
			}

			const slug = buildSlug(input.periodEnd);

			// Slug collision returns the existing edition's id rather than
			// overwriting (immutability decision in the card plan).
			const existing = await prisma.edition.findUnique({
				where: { boardId_slug: { boardId: input.boardId, slug } },
				select: { id: true, slug: true },
			});
			if (existing) {
				return {
					success: true,
					data: {
						id: existing.id,
						slug: existing.slug,
						url: `/squawk/${existing.id}`,
						created: false,
					},
				};
			}

			const created = await prisma.edition.create({
				data: {
					boardId: input.boardId,
					projectId: board.projectId,
					slug,
					masthead: JSON.stringify(input.masthead),
					content: input.content,
					periodStart: input.periodStart,
					periodEnd: input.periodEnd,
				},
				select: { id: true, slug: true },
			});

			return {
				success: true,
				data: {
					id: created.id,
					slug: created.slug,
					url: `/squawk/${created.id}`,
					created: true,
				},
			};
		} catch (error) {
			console.error("[EDITION_SERVICE] publishEdition error:", error);
			return {
				success: false,
				error: { code: "PUBLISH_FAILED", message: "Failed to publish edition." },
			};
		}
	}

	async function getEdition(id: string): Promise<ServiceResult<ParsedEdition | null>> {
		try {
			const row = await prisma.edition.findUnique({ where: { id } });
			if (!row) return { success: true, data: null };
			return {
				success: true,
				data: {
					id: row.id,
					boardId: row.boardId,
					projectId: row.projectId,
					slug: row.slug,
					masthead: parseMasthead(row.masthead),
					content: row.content,
					periodStart: row.periodStart,
					periodEnd: row.periodEnd,
					generatedAt: row.generatedAt,
					url: `/squawk/${row.id}`,
				},
			};
		} catch (error) {
			console.error("[EDITION_SERVICE] getEdition error:", error);
			return {
				success: false,
				error: { code: "FETCH_FAILED", message: "Failed to fetch edition." },
			};
		}
	}

	async function listEditions(
		boardId: string | undefined,
		limit = 50
	): Promise<ServiceResult<ParsedEdition[]>> {
		try {
			const rows = await prisma.edition.findMany({
				where: boardId ? { boardId } : undefined,
				orderBy: { generatedAt: "desc" },
				take: Math.min(Math.max(limit, 1), 200),
			});
			return {
				success: true,
				data: rows.map((row) => ({
					id: row.id,
					boardId: row.boardId,
					projectId: row.projectId,
					slug: row.slug,
					masthead: parseMasthead(row.masthead),
					content: row.content,
					periodStart: row.periodStart,
					periodEnd: row.periodEnd,
					generatedAt: row.generatedAt,
					url: `/squawk/${row.id}`,
				})),
			};
		} catch (error) {
			console.error("[EDITION_SERVICE] listEditions error:", error);
			return {
				success: false,
				error: { code: "LIST_FAILED", message: "Failed to list editions." },
			};
		}
	}

	async function getLatestEdition(boardId: string): Promise<ServiceResult<ParsedEdition | null>> {
		try {
			const row = await prisma.edition.findFirst({
				where: { boardId },
				orderBy: { generatedAt: "desc" },
			});
			if (!row) return { success: true, data: null };
			return {
				success: true,
				data: {
					id: row.id,
					boardId: row.boardId,
					projectId: row.projectId,
					slug: row.slug,
					masthead: parseMasthead(row.masthead),
					content: row.content,
					periodStart: row.periodStart,
					periodEnd: row.periodEnd,
					generatedAt: row.generatedAt,
					url: `/squawk/${row.id}`,
				},
			};
		} catch (error) {
			console.error("[EDITION_SERVICE] getLatestEdition error:", error);
			return {
				success: false,
				error: { code: "FETCH_FAILED", message: "Failed to fetch latest edition." },
			};
		}
	}

	return {
		getActivityWindow,
		publishEdition,
		getEdition,
		listEditions,
		getLatestEdition,
		nextIssueNumber: (boardId: string) => nextIssueNumber(prisma, boardId),
	};
}

export type EditionService = ReturnType<typeof createEditionService>;

// ─── Module-private types/consts ─────────────────────────────────

type ModelPricing = {
	inputPerMTok?: number;
	outputPerMTok?: number;
	cacheReadPerMTok?: number;
	cacheCreation1hPerMTok?: number;
	cacheCreation5mPerMTok?: number;
};

const ZERO_PRICING: ModelPricing = {
	inputPerMTok: 0,
	outputPerMTok: 0,
	cacheReadPerMTok: 0,
	cacheCreation1hPerMTok: 0,
	cacheCreation5mPerMTok: 0,
};

const cardSelect = {
	id: true,
	number: true,
	title: true,
	priority: true,
	updatedAt: true,
	completedAt: true,
	column: { select: { name: true, role: true } },
	milestone: { select: { name: true } },
} as const;
