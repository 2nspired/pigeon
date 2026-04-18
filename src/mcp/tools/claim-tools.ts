import { z } from "zod";
import { db } from "../db.js";
import { registerExtendedTool } from "../tool-registry.js";
import { AGENT_NAME, err, errWithToolHint, ok, resolveCardRef, safeExecute } from "../utils.js";

// ─── RFC: Note + Claim primitives — Step 1 (parallel write surface) ─
//
// These tools write to the new `claim` table but NO reader consults it
// yet. saveFact / recordDecision / listFacts / getDecisions all keep
// their current behavior. Dual-write lands in step 3, read cutover in
// step 4. Until then, saveClaim is opt-in for agents who want to start
// using the new shape.

const CLAIM_KINDS = ["context", "code", "measurement", "decision"] as const;
const CLAIM_STATUSES = ["active", "superseded", "retired"] as const;

type ClaimRow = {
	id: string;
	projectId: string;
	kind: string;
	statement: string;
	body: string;
	evidence: string;
	payload: string;
	author: string;
	cardId: string | null;
	status: string;
	supersedesId: string | null;
	supersededById: string | null;
	recordedAtSha: string | null;
	verifiedAt: Date | null;
	expiresAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
};

function normalizeClaim(row: ClaimRow) {
	return {
		id: row.id,
		projectId: row.projectId,
		kind: row.kind,
		statement: row.statement,
		body: row.body,
		evidence: JSON.parse(row.evidence) as Record<string, unknown>,
		payload: JSON.parse(row.payload) as Record<string, unknown>,
		author: row.author,
		cardId: row.cardId,
		status: row.status,
		supersedesId: row.supersedesId,
		supersededById: row.supersededById,
		recordedAtSha: row.recordedAtSha,
		verifiedAt: row.verifiedAt,
		expiresAt: row.expiresAt,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

// ─── saveClaim ────────────────────────────────────────────────────

registerExtendedTool("saveClaim", {
	category: "context",
	description: `Create or update a Claim — a typed assertion with evidence. Pass claimId to update.

This is the RFC-v2 replacement for saveFact/recordDecision. Old tools still work; use saveClaim for new writes when you want the unified shape (statement + body + evidence + payload).

Kinds:
- context: project-level knowledge claim (payload: { application?, audience?, surface? })
- code: assertion about a file or symbol (evidence.files or evidence.symbols required)
- measurement: numeric value (payload.value + payload.unit required)
- decision: architectural decision (payload: { alternatives? })`,
	parameters: z.object({
		projectId: z.string().describe("Project UUID"),
		kind: z.enum(CLAIM_KINDS).describe("Claim kind"),
		statement: z.string().min(1).describe("One-sentence assertion (shown in lists)"),
		body: z.string().default("").describe("Markdown elaboration"),
		evidence: z
			.object({
				files: z.array(z.string()).optional(),
				symbols: z.array(z.string()).optional(),
				urls: z.array(z.string()).optional(),
				cardIds: z.array(z.string()).optional(),
			})
			.default({})
			.describe("Citations — files, symbols, urls, cardIds"),
		payload: z
			.record(z.string(), z.unknown())
			.default({})
			.describe("Kind-specific structured data — see description"),
		author: z
			.string()
			.default(() => AGENT_NAME)
			.describe("AGENT_NAME or HUMAN"),
		cardId: z.string().optional().describe("Card UUID or #number — optional anchor"),
		status: z.enum(CLAIM_STATUSES).default("active"),
		supersedesId: z
			.string()
			.optional()
			.describe("Claim UUID this one replaces — old claim marked superseded and cross-linked"),
		recordedAtSha: z.string().optional().describe("Git SHA at record time (code/measurement)"),
		verifiedAt: z.string().optional().describe("ISO datetime — defaults to now on create"),
		expiresAt: z.string().optional().describe("ISO datetime — TTL (measurement)"),
		claimId: z.string().optional().describe("Claim UUID — pass to update"),
	}),
	handler: (params) =>
		safeExecute(async () => {
			const {
				projectId,
				kind,
				statement,
				body,
				evidence,
				payload,
				author,
				cardId: cardRef,
				status,
				supersedesId,
				recordedAtSha,
				verifiedAt,
				expiresAt,
				claimId,
			} = params as {
				projectId: string;
				kind: (typeof CLAIM_KINDS)[number];
				statement: string;
				body: string;
				evidence: Record<string, unknown>;
				payload: Record<string, unknown>;
				author: string;
				cardId?: string;
				status: (typeof CLAIM_STATUSES)[number];
				supersedesId?: string;
				recordedAtSha?: string;
				verifiedAt?: string;
				expiresAt?: string;
				claimId?: string;
			};

			const project = await db.project.findUnique({ where: { id: projectId } });
			if (!project) return errWithToolHint("Project not found.", "listProjects", {});

			// Resolve #N card refs to UUIDs within the project.
			let resolvedCardId: string | null = null;
			if (cardRef) {
				const resolved = await resolveCardRef(cardRef, projectId);
				if (!resolved.ok) return err(resolved.message);
				resolvedCardId = resolved.id;
			}

			// Per-kind minimum validation — only reject obvious misuse.
			if (kind === "code") {
				const files = (evidence.files as string[] | undefined) ?? [];
				const symbols = (evidence.symbols as string[] | undefined) ?? [];
				if (files.length === 0 && symbols.length === 0) {
					return err(
						"code claims need at least one evidence.files[] or evidence.symbols[].",
						"Pass the file path(s) or symbol name(s) the claim is about."
					);
				}
			}
			if (kind === "measurement") {
				const value = payload.value;
				const unit = payload.unit;
				if (typeof value !== "number" || typeof unit !== "string" || unit.length === 0) {
					return err(
						"measurement claims need payload.value (number) and payload.unit (string).",
						"Example: payload: { value: 42, unit: 'ms', env: {...} }"
					);
				}
			}

			const data = {
				projectId,
				kind,
				statement,
				body: body ?? "",
				evidence: JSON.stringify(evidence ?? {}),
				payload: JSON.stringify(payload ?? {}),
				author: author ?? AGENT_NAME,
				cardId: resolvedCardId,
				status,
				recordedAtSha: recordedAtSha ?? null,
				verifiedAt: verifiedAt ? new Date(verifiedAt) : new Date(),
				expiresAt: expiresAt ? new Date(expiresAt) : null,
			};

			// Update path
			if (claimId) {
				const existing = await db.claim.findUnique({ where: { id: claimId } });
				if (!existing) return err("Claim not found.", "Check the claimId.");
				const updated = await db.claim.update({ where: { id: claimId }, data });
				return ok(normalizeClaim(updated));
			}

			// Create path — handle supersedes in a transaction so cross-linking is atomic.
			if (supersedesId) {
				const old = await db.claim.findUnique({ where: { id: supersedesId } });
				if (!old) return err("Superseded claim not found.", "Check the supersedesId.");
				const created = await db.$transaction(async (tx) => {
					const newRow = await tx.claim.create({ data: { ...data, supersedesId } });
					await tx.claim.update({
						where: { id: supersedesId },
						data: { status: "superseded", supersededById: newRow.id },
					});
					return newRow;
				});
				return ok(normalizeClaim(created));
			}

			const created = await db.claim.create({ data });
			return ok(normalizeClaim(created));
		}),
});

// ─── listClaims ───────────────────────────────────────────────────

registerExtendedTool("listClaims", {
	category: "context",
	description:
		"List claims for a project. Omit kind to include all kinds. Pass claimId for single-claim lookup.",
	parameters: z.object({
		projectId: z.string().describe("Project UUID"),
		claimId: z.string().optional().describe("Fetch a single claim by UUID"),
		kind: z.enum(CLAIM_KINDS).optional().describe("Filter by kind"),
		cardId: z.string().optional().describe("Filter by card UUID or #number"),
		status: z.enum(CLAIM_STATUSES).optional().describe("Filter by status"),
		author: z.string().optional().describe("Filter by author"),
		limit: z.number().int().min(1).max(200).default(50),
	}),
	annotations: { readOnlyHint: true },
	handler: (params) =>
		safeExecute(async () => {
			const {
				projectId,
				claimId,
				kind,
				cardId: cardRef,
				status,
				author,
				limit,
			} = params as {
				projectId: string;
				claimId?: string;
				kind?: (typeof CLAIM_KINDS)[number];
				cardId?: string;
				status?: (typeof CLAIM_STATUSES)[number];
				author?: string;
				limit: number;
			};

			if (claimId) {
				const row = await db.claim.findUnique({ where: { id: claimId } });
				if (!row) return err("Claim not found.", "Check the claimId.");
				return ok({ claims: [normalizeClaim(row)], total: 1 });
			}

			const project = await db.project.findUnique({ where: { id: projectId } });
			if (!project) return errWithToolHint("Project not found.", "listProjects", {});

			let resolvedCardId: string | undefined;
			if (cardRef) {
				const resolved = await resolveCardRef(cardRef, projectId);
				if (!resolved.ok) return err(resolved.message);
				resolvedCardId = resolved.id;
			}

			const where: Record<string, unknown> = { projectId };
			if (kind) where.kind = kind;
			if (resolvedCardId) where.cardId = resolvedCardId;
			if (status) where.status = status;
			if (author) where.author = author;

			const rows = await db.claim.findMany({
				where,
				orderBy: { updatedAt: "desc" },
				take: limit,
			});

			return ok({ claims: rows.map(normalizeClaim), total: rows.length });
		}),
});
