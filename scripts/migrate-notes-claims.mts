/**
 * One-shot backfill: legacy knowledge tables → Note + Claim.
 *
 * Maps:
 *   SessionHandoff         → Note(kind="handoff") with metadata.{workingOn, findings, nextSteps, blockers}
 *   Decision               → Claim(kind="decision"); status rewrites proposed/accepted→active, rejected/deprecated→retired
 *   PersistentContextEntry → Claim(kind="context")
 *   CodeFact               → Claim(kind="code")
 *   MeasurementFact        → Claim(kind="measurement")
 *
 * Idempotency: new rows reuse the legacy UUID as their id. Reruns detect
 * already-migrated rows by checking the target table for that id, so the
 * script is safe to run repeatedly.
 *
 * Legacy-table reads use raw SQL so the script keeps working after the
 * 3.0.0 schema drop removes those models from the Prisma client. If the
 * legacy tables themselves are gone (db:push already ran), the raw query
 * throws — run this BEFORE `npm run db:push` on the 3.0.0 upgrade.
 *
 * Usage:  npx tsx scripts/migrate-notes-claims.mts
 */

const { PrismaBetterSqlite3 } = await import("@prisma/adapter-better-sqlite3");
const { PrismaClient } = await import("prisma/generated/client");

const adapter = new PrismaBetterSqlite3({ url: "file:./data/tracker.db" });
const db = new PrismaClient({ adapter });

type Counts = { inserted: number; skipped: number };

function j(v: unknown): string {
	return JSON.stringify(v);
}

function toDate(v: unknown): Date {
	if (v instanceof Date) return v;
	if (typeof v === "string" || typeof v === "number") return new Date(v);
	throw new Error(`Cannot coerce to Date: ${String(v)}`);
}

function toDateOrNull(v: unknown): Date | null {
	if (v === null || v === undefined) return null;
	return toDate(v);
}

async function legacyTableExists(table: string): Promise<boolean> {
	const rows = await db.$queryRawUnsafe<Array<{ name: string }>>(
		`SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
		table
	);
	return rows.length > 0;
}

type LegacyHandoff = {
	id: string;
	board_id: string;
	agent_name: string;
	working_on: string;
	findings: string;
	next_steps: string;
	blockers: string;
	summary: string;
	created_at: string | Date;
};

async function migrateHandoffs(): Promise<Counts> {
	if (!(await legacyTableExists("session_handoff"))) return { inserted: 0, skipped: 0 };
	const legacy = await db.$queryRawUnsafe<LegacyHandoff[]>(`SELECT * FROM session_handoff`);
	const existingIds = new Set(
		(await db.note.findMany({ where: { kind: "handoff" }, select: { id: true } })).map((n) => n.id)
	);

	let inserted = 0;
	let skipped = 0;
	for (const sh of legacy) {
		if (existingIds.has(sh.id)) {
			skipped++;
			continue;
		}
		const board = await db.board.findUnique({ where: { id: sh.board_id } });
		const createdAt = toDate(sh.created_at);

		await db.note.create({
			data: {
				id: sh.id,
				kind: "handoff",
				title: `Handoff by ${sh.agent_name}`,
				content: sh.summary ?? "",
				author: sh.agent_name,
				boardId: sh.board_id,
				projectId: board?.projectId ?? null,
				tags: "[]",
				metadata: j({
					workingOn: JSON.parse(sh.working_on) as string[],
					findings: JSON.parse(sh.findings) as string[],
					nextSteps: JSON.parse(sh.next_steps) as string[],
					blockers: JSON.parse(sh.blockers) as string[],
				}),
				createdAt,
				updatedAt: createdAt,
			},
		});
		inserted++;
	}
	return { inserted, skipped };
}

type LegacyDecision = {
	id: string;
	project_id: string;
	card_id: string | null;
	title: string;
	status: string;
	decision: string;
	alternatives: string;
	rationale: string;
	author: string;
	supersedes: string | null;
	superseded_by: string | null;
	created_at: string | Date;
	updated_at: string | Date;
};

async function migrateDecisions(): Promise<Counts> {
	if (!(await legacyTableExists("decision"))) return { inserted: 0, skipped: 0 };
	const legacy = await db.$queryRawUnsafe<LegacyDecision[]>(
		`SELECT * FROM decision ORDER BY created_at ASC`
	);
	const existingIds = new Set(
		(await db.claim.findMany({ where: { kind: "decision" }, select: { id: true } })).map(
			(c) => c.id
		)
	);

	const statusMap: Record<string, string> = {
		proposed: "active",
		accepted: "active",
		superseded: "superseded",
		rejected: "retired",
		deprecated: "retired",
	};

	let inserted = 0;
	let skipped = 0;

	for (const d of legacy) {
		if (existingIds.has(d.id)) {
			skipped++;
			continue;
		}

		const body = d.rationale ? `${d.decision}\n\n${d.rationale}` : d.decision;

		await db.claim.create({
			data: {
				id: d.id,
				projectId: d.project_id,
				kind: "decision",
				statement: d.title,
				body,
				evidence: "{}",
				payload: j({
					alternatives: JSON.parse(d.alternatives) as string[],
				}),
				author: d.author,
				cardId: d.card_id,
				status: statusMap[d.status] ?? "active",
				createdAt: toDate(d.created_at),
				updatedAt: toDate(d.updated_at),
			},
		});
		inserted++;
	}

	for (const d of legacy) {
		if (!d.supersedes && !d.superseded_by) continue;
		const target = await db.claim.findUnique({ where: { id: d.id } });
		if (!target) continue;
		if (target.supersedesId === d.supersedes && target.supersededById === d.superseded_by) continue;
		await db.claim.update({
			where: { id: d.id },
			data: {
				supersedesId: d.supersedes,
				supersededById: d.superseded_by,
			},
		});
	}

	return { inserted, skipped };
}

type LegacyContext = {
	id: string;
	project_id: string;
	claim: string;
	rationale: string;
	application: string;
	details: string;
	author: string;
	audience: string;
	cited_files: string;
	recorded_at_sha: string | null;
	surface: string;
	created_at: string | Date;
	updated_at: string | Date;
};

async function migrateContext(): Promise<Counts> {
	if (!(await legacyTableExists("persistent_context_entry"))) return { inserted: 0, skipped: 0 };
	const legacy = await db.$queryRawUnsafe<LegacyContext[]>(
		`SELECT * FROM persistent_context_entry`
	);
	const existingIds = new Set(
		(await db.claim.findMany({ where: { kind: "context" }, select: { id: true } })).map((c) => c.id)
	);

	let inserted = 0;
	let skipped = 0;
	for (const p of legacy) {
		if (existingIds.has(p.id)) {
			skipped++;
			continue;
		}

		const details = JSON.parse(p.details) as string[];
		const body = [p.rationale, details.length > 0 ? details.join("\n") : ""]
			.filter(Boolean)
			.join("\n\n");
		const citedFiles = JSON.parse(p.cited_files) as string[];

		await db.claim.create({
			data: {
				id: p.id,
				projectId: p.project_id,
				kind: "context",
				statement: p.claim,
				body,
				evidence: j(citedFiles.length > 0 ? { files: citedFiles } : {}),
				payload: j({
					...(p.application && { application: p.application }),
					audience: p.audience,
					surface: p.surface,
				}),
				author: p.author,
				recordedAtSha: p.recorded_at_sha,
				createdAt: toDate(p.created_at),
				updatedAt: toDate(p.updated_at),
			},
		});
		inserted++;
	}
	return { inserted, skipped };
}

type LegacyCodeFact = {
	id: string;
	project_id: string;
	path: string;
	symbol: string | null;
	fact: string;
	author: string;
	recorded_at_sha: string | null;
	needs_recheck: number;
	last_verified_at: string | Date | null;
	created_at: string | Date;
	updated_at: string | Date;
};

async function migrateCodeFacts(): Promise<Counts> {
	if (!(await legacyTableExists("code_fact"))) return { inserted: 0, skipped: 0 };
	const legacy = await db.$queryRawUnsafe<LegacyCodeFact[]>(`SELECT * FROM code_fact`);
	const existingIds = new Set(
		(await db.claim.findMany({ where: { kind: "code" }, select: { id: true } })).map((c) => c.id)
	);

	let inserted = 0;
	let skipped = 0;
	for (const c of legacy) {
		if (existingIds.has(c.id)) {
			skipped++;
			continue;
		}

		await db.claim.create({
			data: {
				id: c.id,
				projectId: c.project_id,
				kind: "code",
				statement: c.fact,
				body: "",
				evidence: j({
					files: [c.path],
					...(c.symbol && { symbols: [c.symbol] }),
				}),
				payload: "{}",
				author: c.author,
				recordedAtSha: c.recorded_at_sha,
				verifiedAt: toDateOrNull(c.last_verified_at),
				createdAt: toDate(c.created_at),
				updatedAt: toDate(c.updated_at),
			},
		});
		inserted++;
	}
	return { inserted, skipped };
}

type LegacyMeasurement = {
	id: string;
	project_id: string;
	value: number;
	unit: string;
	description: string;
	env: string;
	path: string | null;
	symbol: string | null;
	author: string;
	recorded_at: string | Date;
	ttl: number | null;
	needs_recheck: number;
	created_at: string | Date;
	updated_at: string | Date;
};

async function migrateMeasurements(): Promise<Counts> {
	if (!(await legacyTableExists("measurement_fact"))) return { inserted: 0, skipped: 0 };
	const legacy = await db.$queryRawUnsafe<LegacyMeasurement[]>(`SELECT * FROM measurement_fact`);
	const existingIds = new Set(
		(await db.claim.findMany({ where: { kind: "measurement" }, select: { id: true } })).map(
			(c) => c.id
		)
	);

	let inserted = 0;
	let skipped = 0;
	for (const m of legacy) {
		if (existingIds.has(m.id)) {
			skipped++;
			continue;
		}

		const env = JSON.parse(m.env) as Record<string, string>;
		const evidence: Record<string, unknown> = {};
		if (m.path) evidence.files = [m.path];
		if (m.symbol) evidence.symbols = [m.symbol];

		const recordedAt = toDate(m.recorded_at);
		const expiresAt =
			m.ttl != null ? new Date(recordedAt.getTime() + m.ttl * 24 * 60 * 60 * 1000) : null;

		await db.claim.create({
			data: {
				id: m.id,
				projectId: m.project_id,
				kind: "measurement",
				statement: m.description,
				body: "",
				evidence: j(evidence),
				payload: j({
					value: m.value,
					unit: m.unit,
					env,
				}),
				author: m.author,
				expiresAt,
				createdAt: toDate(m.created_at),
				updatedAt: toDate(m.updated_at),
			},
		});
		inserted++;
	}
	return { inserted, skipped };
}

function fmt(label: string, c: Counts): string {
	const padded = label.padEnd(13);
	return `  ${padded} +${c.inserted} inserted, ${c.skipped} already migrated`;
}

async function legacyCount(table: string): Promise<number> {
	if (!(await legacyTableExists(table))) return 0;
	const rows = await db.$queryRawUnsafe<Array<{ n: number | bigint }>>(
		`SELECT COUNT(*) AS n FROM ${table}`
	);
	return Number(rows[0]?.n ?? 0);
}

async function main() {
	console.log("Note+Claim backfill");
	console.log("────────────────────");

	const handoffs = await migrateHandoffs();
	console.log(fmt("handoffs:", handoffs));

	const decisions = await migrateDecisions();
	console.log(fmt("decisions:", decisions));

	const context = await migrateContext();
	console.log(fmt("context:", context));

	const code = await migrateCodeFacts();
	console.log(fmt("code:", code));

	const measurements = await migrateMeasurements();
	console.log(fmt("measurements:", measurements));

	console.log("");
	console.log("Verification — legacy vs target counts by kind:");

	const legacyCounts = {
		handoff: await legacyCount("session_handoff"),
		decision: await legacyCount("decision"),
		context: await legacyCount("persistent_context_entry"),
		code: await legacyCount("code_fact"),
		measurement: await legacyCount("measurement_fact"),
	};
	const newCounts = {
		handoff: await db.note.count({ where: { kind: "handoff" } }),
		decision: await db.claim.count({ where: { kind: "decision" } }),
		context: await db.claim.count({ where: { kind: "context" } }),
		code: await db.claim.count({ where: { kind: "code" } }),
		measurement: await db.claim.count({ where: { kind: "measurement" } }),
	};

	let ok = true;
	for (const kind of Object.keys(legacyCounts) as Array<keyof typeof legacyCounts>) {
		const legacyN = legacyCounts[kind];
		const newN = newCounts[kind];
		// After the 3.0.0 drop, legacyN is 0 and newN carries all rows — that's fine.
		const icon = legacyN === 0 || legacyN === newN ? "✓" : "✗";
		if (legacyN !== 0 && legacyN !== newN) ok = false;
		console.log(`  ${icon} ${kind.padEnd(12)} legacy=${legacyN} new=${newN}`);
	}

	console.log("");
	if (!ok) {
		console.error("Counts don't match — investigate before dropping legacy tables.");
		process.exit(1);
	}
	console.log("Backfill complete. Run `npm run db:push` to drop the legacy tables.");
}

main()
	.catch((err) => {
		console.error(err);
		process.exit(1);
	})
	.finally(() => db.$disconnect());
