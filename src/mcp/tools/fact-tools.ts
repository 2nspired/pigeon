import type { Claim } from "prisma/generated/client";
import { z } from "zod";
import { db } from "../db.js";
import { registerExtendedTool } from "../tool-registry.js";
import { err, ok, safeExecute } from "../utils.js";

// ─── Unified Fact Tools ──────────────────────────────────────────
//
// Post-cutover (commit 5 of docs/IMPL-NOTE-CLAIM-CUTOVER.md) listFacts
// reads from Claim and maps back to the legacy shape so existing
// agents keep working. saveFact still writes legacy tables until
// commit 6 aliases the write path to saveClaim.

const FACT_TYPES = ["context", "code", "measurement"] as const;
const VALID_SURFACES = ["ambient", "indexed", "surfaced"] as const;

// ─── Legacy-shape normalizers (writer path) ───────────────────────

type ContextRow = {
	id: string;
	projectId: string;
	claim: string;
	rationale: string;
	application: string;
	details: string;
	author: string;
	audience: string;
	citedFiles: string;
	recordedAtSha: string | null;
	surface: string;
	createdAt: Date;
	updatedAt: Date;
};

type CodeRow = {
	id: string;
	projectId: string;
	path: string;
	symbol: string | null;
	fact: string;
	author: string;
	recordedAtSha: string | null;
	needsRecheck: boolean;
	lastVerifiedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
};

type MeasurementRow = {
	id: string;
	projectId: string;
	value: number;
	unit: string;
	description: string;
	env: string;
	path: string | null;
	symbol: string | null;
	author: string;
	recordedAt: Date;
	ttl: number | null;
	needsRecheck: boolean;
	createdAt: Date;
	updatedAt: Date;
};

function normalizeContext(e: ContextRow) {
	return {
		id: e.id,
		type: "context" as const,
		projectId: e.projectId,
		content: e.claim,
		author: e.author,
		rationale: e.rationale,
		application: e.application,
		details: JSON.parse(e.details) as string[],
		audience: e.audience,
		citedFiles: JSON.parse(e.citedFiles) as string[],
		recordedAtSha: e.recordedAtSha,
		surface: e.surface,
		createdAt: e.createdAt,
		updatedAt: e.updatedAt,
	};
}

function normalizeCode(f: CodeRow) {
	return {
		id: f.id,
		type: "code" as const,
		projectId: f.projectId,
		content: f.fact,
		path: f.path,
		symbol: f.symbol,
		author: f.author,
		recordedAtSha: f.recordedAtSha,
		needsRecheck: f.needsRecheck,
		lastVerifiedAt: f.lastVerifiedAt,
		createdAt: f.createdAt,
		updatedAt: f.updatedAt,
	};
}

function normalizeMeasurement(m: MeasurementRow) {
	return {
		id: m.id,
		type: "measurement" as const,
		projectId: m.projectId,
		content: m.description,
		value: m.value,
		unit: m.unit,
		env: JSON.parse(m.env) as Record<string, unknown>,
		path: m.path,
		symbol: m.symbol,
		author: m.author,
		recordedAt: m.recordedAt,
		ttl: m.ttl,
		needsRecheck: m.needsRecheck,
		createdAt: m.createdAt,
		updatedAt: m.updatedAt,
	};
}

// ─── Claim → legacy fact shape (reader path) ──────────────────────

function claimToFact(c: Claim) {
	const evidence = JSON.parse(c.evidence) as {
		files?: string[];
		symbols?: string[];
	};
	const payload = JSON.parse(c.payload) as Record<string, unknown>;
	const files = evidence.files ?? [];
	const symbols = evidence.symbols ?? [];

	if (c.kind === "context") {
		return {
			id: c.id,
			type: "context" as const,
			projectId: c.projectId,
			content: c.statement,
			author: c.author,
			rationale: c.body,
			application: (payload.application as string) ?? "",
			details: [] as string[],
			audience: (payload.audience as string) ?? "all",
			citedFiles: files,
			recordedAtSha: c.recordedAtSha,
			surface: (payload.surface as string) ?? "indexed",
			createdAt: c.createdAt,
			updatedAt: c.updatedAt,
		};
	}
	if (c.kind === "code") {
		return {
			id: c.id,
			type: "code" as const,
			projectId: c.projectId,
			content: c.statement,
			path: files[0] ?? "",
			symbol: symbols[0] ?? null,
			author: c.author,
			recordedAtSha: c.recordedAtSha,
			needsRecheck: false,
			lastVerifiedAt: c.verifiedAt,
			createdAt: c.createdAt,
			updatedAt: c.updatedAt,
		};
	}
	// measurement
	return {
		id: c.id,
		type: "measurement" as const,
		projectId: c.projectId,
		content: c.statement,
		value: (payload.value as number) ?? 0,
		unit: (payload.unit as string) ?? "",
		env: (payload.env as Record<string, unknown>) ?? {},
		path: files[0] ?? null,
		symbol: symbols[0] ?? null,
		author: c.author,
		recordedAt: c.createdAt,
		ttl: null as number | null,
		needsRecheck: false,
		createdAt: c.createdAt,
		updatedAt: c.updatedAt,
	};
}

type LegacyFact = ReturnType<typeof claimToFact>;

// ─── saveFact ─────────────────────────────────────────────────────

registerExtendedTool("saveFact", {
	category: "context",
	description: `Create or update a persistent fact. Pass factId to update.

Types:
- **context**: Project-level knowledge claim (content = the claim, plus rationale/application/details)
- **code**: Assertion about a file or symbol (content = the fact, path required)
- **measurement**: Numeric value like latency or bundle size (content = description, value + unit required)`,
	parameters: z.object({
		type: z.enum(FACT_TYPES).describe("Fact type: context | code | measurement"),
		projectId: z.string().describe("Project UUID"),
		content: z
			.string()
			.describe(
				"The fact text — maps to claim (context), fact (code), or description (measurement)"
			),
		author: z.string().default("AGENT").describe("Who recorded this (AGENT or HUMAN)"),
		// Common optional
		path: z
			.string()
			.optional()
			.describe("File path relative to repo root (required for code, optional for measurement)"),
		symbol: z.string().optional().describe("Symbol name (function, class, variable)"),
		recordedAtSha: z.string().optional().describe("Git SHA when this was recorded"),
		factId: z.string().optional().describe("Fact UUID — pass to update an existing fact"),
		// Context-specific
		rationale: z.string().optional().describe("[context] Why this matters"),
		application: z.string().optional().describe("[context] How to apply this knowledge"),
		details: z.array(z.string()).optional().describe("[context] Supporting details"),
		audience: z.string().optional().describe("[context] Who should see it (all, agent, human)"),
		citedFiles: z
			.array(z.string())
			.optional()
			.describe("[context] File paths this fact references"),
		surface: z
			.enum(VALID_SURFACES)
			.optional()
			.describe("[context] Visibility: ambient | indexed | surfaced"),
		// Measurement-specific
		value: z.number().optional().describe("[measurement] Numeric value"),
		unit: z.string().optional().describe("[measurement] Unit (e.g. ms, MB, s, bytes)"),
		env: z
			.record(z.string(), z.string())
			.optional()
			.describe("[measurement] Environment key-value pairs"),
		recordedAt: z
			.string()
			.optional()
			.describe("[measurement] ISO 8601 when measured (defaults to now)"),
		ttl: z.number().int().optional().describe("[measurement] Time-to-live in days"),
	}),
	handler: (params) =>
		safeExecute(async () => {
			const { type, projectId, content, author, path, symbol, recordedAtSha, factId } = params as {
				type: string;
				projectId: string;
				content: string;
				author: string;
				path?: string;
				symbol?: string;
				recordedAtSha?: string;
				factId?: string;
			};

			const project = await db.project.findUnique({ where: { id: projectId } });
			if (!project) return err("Project not found.", "Use listProjects to find a valid projectId.");

			// ── Context ───────────────────────────────
			if (type === "context") {
				const data = {
					projectId,
					claim: content,
					rationale: (params.rationale as string) ?? "",
					application: (params.application as string) ?? "",
					details: JSON.stringify((params.details as string[]) ?? []),
					author: author ?? "AGENT",
					audience: (params.audience as string) ?? "all",
					citedFiles: JSON.stringify((params.citedFiles as string[]) ?? []),
					recordedAtSha: recordedAtSha ?? null,
					surface: (params.surface as string) ?? "indexed",
				};

				if (factId) {
					const existing = await db.persistentContextEntry.findUnique({ where: { id: factId } });
					if (!existing) return err("Context entry not found.", "Check the factId and try again.");
					const updated = await db.persistentContextEntry.update({
						where: { id: factId },
						data,
					});
					return ok(normalizeContext(updated));
				}

				const created = await db.persistentContextEntry.create({ data });
				return ok(normalizeContext(created));
			}

			// ── Code ──────────────────────────────────
			if (type === "code") {
				if (!path)
					return err(
						"path is required for code facts.",
						"Provide the file path relative to the repo root."
					);

				const data = {
					projectId,
					path,
					fact: content,
					symbol: symbol ?? null,
					author: author ?? "AGENT",
					recordedAtSha: recordedAtSha ?? null,
					needsRecheck: false,
				};

				if (factId) {
					const existing = await db.codeFact.findUnique({ where: { id: factId } });
					if (!existing) return err("Code fact not found.", "Check the factId and try again.");
					const updated = await db.codeFact.update({
						where: { id: factId },
						data: { ...data, lastVerifiedAt: new Date() },
					});
					return ok(normalizeCode(updated));
				}

				const created = await db.codeFact.create({ data });
				return ok(normalizeCode(created));
			}

			// ── Measurement ───────────────────────────
			if (type === "measurement") {
				const value = params.value as number | undefined;
				const unit = params.unit as string | undefined;
				if (value == null || !unit) return err("value and unit are required for measurements.");

				const data = {
					projectId,
					value,
					unit,
					description: content,
					env: JSON.stringify((params.env as Record<string, string>) ?? {}),
					path: path ?? null,
					symbol: symbol ?? null,
					author: author ?? "AGENT",
					recordedAt: params.recordedAt ? new Date(params.recordedAt as string) : new Date(),
					ttl: (params.ttl as number) ?? null,
					needsRecheck: false,
				};

				if (factId) {
					const existing = await db.measurementFact.findUnique({ where: { id: factId } });
					if (!existing) return err("Measurement not found.", "Check the factId and try again.");
					const updated = await db.measurementFact.update({ where: { id: factId }, data });
					return ok(normalizeMeasurement(updated));
				}

				const created = await db.measurementFact.create({ data });
				return ok(normalizeMeasurement(created));
			}

			return err(`Invalid type "${type}".`, "Use: context, code, or measurement.");
		}),
});

// ─── listFacts ────────────────────────────────────────────────────

registerExtendedTool("listFacts", {
	category: "context",
	description:
		"List facts for a project. Omit type to list all types. Filter by path or surface. Pass factId for single-fact lookup. (Reads from the unified Claim table — prefer listClaims for new code.)",
	parameters: z.object({
		projectId: z.string().describe("Project UUID"),
		factId: z.string().optional().describe("Fetch a single fact by UUID"),
		type: z.enum(FACT_TYPES).optional().describe("Filter by fact type"),
		path: z.string().optional().describe("Filter by exact file path (code/measurement)"),
		pathPrefix: z.string().optional().describe("Filter by path prefix (e.g. 'src/mcp/')"),
		surface: z.enum(VALID_SURFACES).optional().describe("Filter context entries by surface level"),
		needsRecheck: z
			.boolean()
			.optional()
			.describe("(deprecated — no longer tracked; filter ignored)"),
		author: z.string().optional().describe("Filter by author (AGENT or HUMAN)"),
		limit: z.number().int().min(1).max(200).default(50).describe("Max facts per type"),
	}),
	annotations: { readOnlyHint: true },
	handler: (params) =>
		safeExecute(async () => {
			const {
				projectId,
				factId: singleId,
				type,
				path,
				pathPrefix,
				surface,
				author,
				limit,
			} = params as {
				projectId: string;
				factId?: string;
				type?: string;
				path?: string;
				pathPrefix?: string;
				surface?: string;
				author?: string;
				limit: number;
			};

			if (singleId) {
				const claim = await db.claim.findUnique({ where: { id: singleId } });
				if (!claim || !FACT_TYPES.includes(claim.kind as (typeof FACT_TYPES)[number])) {
					return err("Fact not found.", "Check the factId and try again.");
				}
				return ok({ facts: [claimToFact(claim)], total: 1 });
			}

			const project = await db.project.findUnique({ where: { id: projectId } });
			if (!project) return err("Project not found.", "Use listProjects to find a valid projectId.");

			const kinds = type ? [type] : (FACT_TYPES as readonly string[]);
			const results: LegacyFact[] = [];

			for (const kind of kinds) {
				const where: Record<string, unknown> = { projectId, kind };
				if (author) where.author = author;
				const claims = await db.claim.findMany({
					where,
					orderBy: { updatedAt: "desc" },
					take: limit,
				});

				for (const c of claims) {
					const fact = claimToFact(c);
					if (fact.type === "context" && surface && fact.surface !== surface) continue;
					if ((fact.type === "code" || fact.type === "measurement") && (path || pathPrefix)) {
						const filePath = fact.path ?? "";
						if (path && filePath !== path) continue;
						if (pathPrefix && !filePath.startsWith(pathPrefix)) continue;
					}
					results.push(fact);
				}
			}

			return ok({ facts: results, total: results.length });
		}),
});
