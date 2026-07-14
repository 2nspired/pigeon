/**
 * Idempotent Prisma migrations helper (#314 Phase A).
 *
 * Replaces `prisma db push` on every install/update path. Decision logic:
 *
 *   - no DB file                          → create it, apply every migration
 *   - DB exists, no `_prisma_migrations`  → pre-migrations install (created by
 *     `prisma db push`); write the `0_init` baseline marker, then apply
 *     anything newer
 *   - otherwise                           → apply pending migrations
 *
 * Everything runs natively over better-sqlite3 — the Prisma schema engine
 * (`migrate deploy` / `migrate resolve`) is deliberately NOT used on these
 * paths. The engine refuses to write ("database is locked") while any other
 * connection has touched the DB, and on a live install a Pigeon MCP server
 * almost always has (#314 live verification; reproducible: open a
 * better-sqlite3 connection, run one SELECT, then try `migrate deploy`).
 * Ledger rows are byte-compatible with what the engine writes, so dev-side
 * tooling (`prisma migrate dev`, `migrate status`) sees a normal history.
 *
 * Failure semantics are simpler than the engine's: a migration script is
 * executed statement-by-statement (autocommit, so Prisma's PRAGMA dance in
 * rebuild scripts behaves as authored) and its ledger row is written only
 * after the script succeeds. If a script dies half-way the DB may hold
 * partial DDL and no ledger row — restore the pre-update snapshot from
 * `data/backups/` (service:update takes one first) and retry.
 *
 * `migrate deploy` does not drift-check, so the runtime FTS5 tables (derived
 * state living outside `schema.prisma`) never block an install or update.
 * They only matter on the dev-facing schema-change path (`prisma migrate dev`
 * flags them as drift), which is why `dropDerivedFtsTables` lives here and is
 * called by the `--dev` CLI mode only.
 *
 * Callable as a function (scripts/dev.ts, scripts/setup.mts,
 * scripts/service.ts) and as a CLI:
 *
 *   tsx scripts/db-migrate.ts            # apply pending migrations (deploy path)
 *   tsx scripts/db-migrate.ts --dev      # schema-change workflow: drop derived
 *                                        # FTS5 tables, then `prisma migrate dev`
 *                                        # (extra args pass through, e.g. --name)
 *
 * `DATABASE_URL` overrides the target DB (honored by `prisma.config.ts`);
 * defaults to the live `file:./data/tracker.db`.
 */

import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

export const BASELINE_MIGRATION = "0_init";
export const DEFAULT_DATABASE_URL = "file:./data/tracker.db";

// FTS5 virtual + shadow tables created at runtime by `initFts5` in
// `src/server/db.ts` / `src/mcp/db.ts`. They live outside Prisma's schema
// view, so `prisma migrate dev` flags every one of them as drift. Dropping
// them pre-`migrate dev` is safe: the index is derived state over
// Note/Claim/Card/Comment/markdown, and `initFts5` recreates the empty
// virtual table on the next service start. `queryKnowledge` lazy-rebuilds
// per project on the first search after.
export const FTS_TABLES = [
	"knowledge_fts",
	"knowledge_fts_data",
	"knowledge_fts_idx",
	"knowledge_fts_content",
	"knowledge_fts_docsize",
	"knowledge_fts_config",
];

/** Strip the `file:` scheme and resolve the SQLite path against `cwd`. */
export function dbPathFromUrl(url: string, cwd: string = process.cwd()): string {
	const path = url.startsWith("file:") ? url.slice("file:".length) : url;
	return isAbsolute(path) ? path : resolve(cwd, path);
}

/** True when the SQLite file already has Prisma's `_prisma_migrations` table. */
export function hasMigrationsTable(dbPath: string): boolean {
	const db = new Database(dbPath, { readonly: true, fileMustExist: true });
	try {
		const row = db
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_prisma_migrations'")
			.get();
		return row !== undefined;
	} finally {
		db.close();
	}
}

// Prisma's own DDL for the migrations ledger (what `migrate resolve` and
// `migrate deploy` create). Kept verbatim so hand-written baselines are
// indistinguishable from engine-written ones.
const PRISMA_MIGRATIONS_DDL = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
)`;

/** SHA-256 hex of a migration's `migration.sql` — Prisma's checksum format. */
function migrationChecksum(migrationsDir: string, migrationName: string): string {
	const script = readFileSync(join(migrationsDir, migrationName, "migration.sql"));
	return createHash("sha256").update(script).digest("hex");
}

/**
 * Migration folder names under `migrationsDir`, in apply order (lexicographic,
 * matching Prisma: `0_init` sorts before the timestamped `2026…_name` dirs).
 */
export function listMigrations(migrationsDir: string): string[] {
	if (!existsSync(migrationsDir)) return [];
	return readdirSync(migrationsDir, { withFileTypes: true })
		.filter((e) => e.isDirectory() && existsSync(join(migrationsDir, e.name, "migration.sql")))
		.map((e) => e.name)
		.sort();
}

/**
 * Mark the baseline migration as applied without going through the schema
 * engine (see module doc comment for why). Idempotent: no-ops when a
 * non-rolled-back row for the migration already exists. Mirrors
 * `prisma migrate resolve --applied` exactly (`logs: ''`, `applied_steps_count: 0`).
 */
export function markBaselineApplied(options: {
	dbPath: string;
	/** Directory holding `<migration>/migration.sql`. */
	migrationsDir: string;
	migrationName?: string;
}): void {
	const migrationName = options.migrationName ?? BASELINE_MIGRATION;
	const checksum = migrationChecksum(options.migrationsDir, migrationName);

	const db = new Database(options.dbPath, { fileMustExist: true });
	try {
		db.pragma("busy_timeout = 5000");
		db.exec(PRISMA_MIGRATIONS_DDL);
		const existing = db
			.prepare(
				"SELECT id FROM _prisma_migrations WHERE migration_name = ? AND rolled_back_at IS NULL",
			)
			.get(migrationName);
		if (existing !== undefined) return;
		const now = Date.now();
		db.prepare(
			`INSERT INTO _prisma_migrations
				(id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
			 VALUES (?, ?, ?, ?, '', NULL, ?, 0)`,
		).run(randomUUID(), checksum, now, migrationName, now);
	} finally {
		db.close();
	}
}

export type MigrateStep = "resolve-baseline" | "deploy";

/**
 * Pure decision logic — see the module doc comment for the three branches.
 */
export function planMigrateSteps(dbExists: boolean, migrationsTableExists: boolean): MigrateStep[] {
	if (dbExists && !migrationsTableExists) return ["resolve-baseline", "deploy"];
	return ["deploy"];
}

export interface RunMigrationsOptions {
	/** Project root migration paths resolve against. Defaults to `process.cwd()`. */
	cwd?: string;
	/** Target DB. Defaults to `process.env.DATABASE_URL`, then the live file. */
	databaseUrl?: string;
	log?: (message: string) => void;
	/** Directory holding the migration folders. Defaults to `<cwd>/prisma/migrations`. */
	migrationsDir?: string;
}

export interface RunMigrationsResult {
	steps: MigrateStep[];
	/** Migration names actually executed this run (empty when up to date). */
	applied: string[];
	baselined: boolean;
}

/**
 * Apply migrations idempotently, engine-free. Returns the path taken so
 * callers (and tests) can assert on it.
 */
export function runMigrations(options: RunMigrationsOptions = {}): RunMigrationsResult {
	const cwd = options.cwd ?? process.cwd();
	const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
	const log = options.log ?? console.log;

	const dbPath = dbPathFromUrl(databaseUrl, cwd);
	const migrationsDir = options.migrationsDir ?? resolve(cwd, "prisma", "migrations");
	const migrations = listMigrations(migrationsDir);
	if (migrations.length === 0) {
		throw new Error(`No migrations found in ${migrationsDir} — is the checkout complete?`);
	}
	const dbExists = existsSync(dbPath);
	const steps = planMigrateSteps(dbExists, dbExists && hasMigrationsTable(dbPath));

	let baselined = false;
	if (steps.includes("resolve-baseline")) {
		log(`Existing pre-migrations database detected — baselining as ${BASELINE_MIGRATION}...`);
		markBaselineApplied({ dbPath, migrationsDir });
		baselined = true;
	}

	if (!dbExists) {
		log("Database not found — creating it from migrations...");
		mkdirSync(dirname(dbPath), { recursive: true });
	}

	const db = new Database(dbPath);
	const applied: string[] = [];
	try {
		db.pragma("busy_timeout = 5000");
		db.exec(PRISMA_MIGRATIONS_DDL);
		const recorded = new Map(
			(
				db
					.prepare(
						"SELECT migration_name, checksum FROM _prisma_migrations WHERE rolled_back_at IS NULL",
					)
					.all() as Array<{ migration_name: string; checksum: string }>
			).map((row) => [row.migration_name, row.checksum]),
		);

		for (const name of migrations) {
			const checksum = migrationChecksum(migrationsDir, name);
			const recordedChecksum = recorded.get(name);
			if (recordedChecksum !== undefined) {
				if (recordedChecksum !== checksum) {
					throw new Error(
						`Migration ${name} was edited after being applied (checksum mismatch). ` +
							`Never modify an applied migration — add a new one instead.`,
					);
				}
				continue;
			}
			log(`Applying migration ${name}...`);
			const startedAt = Date.now();
			db.exec(readFileSync(join(migrationsDir, name, "migration.sql"), "utf-8"));
			db.prepare(
				`INSERT INTO _prisma_migrations
					(id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
				 VALUES (?, ?, ?, ?, NULL, NULL, ?, 1)`,
			).run(randomUUID(), checksum, Date.now(), name, startedAt);
			applied.push(name);
		}
	} finally {
		db.close();
	}

	log(
		applied.length > 0
			? `Applied ${applied.length} migration${applied.length === 1 ? "" : "s"}.`
			: "Database schema is up to date.",
	);
	return { steps, applied, baselined };
}

/**
 * Drop the runtime FTS5 tables so `prisma migrate dev` doesn't flag them as
 * drift. Non-fatal on error — worst case `migrate dev` reports the drift
 * itself with a clear table list.
 */
export function dropDerivedFtsTables(options: { cwd?: string; databaseUrl?: string } = {}): void {
	const cwd = options.cwd ?? process.cwd();
	const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
	const dbPath = dbPathFromUrl(databaseUrl, cwd);
	if (!existsSync(dbPath)) return;
	try {
		const db = new Database(dbPath);
		try {
			db.pragma("busy_timeout = 5000");
			for (const table of FTS_TABLES) {
				db.exec(`DROP TABLE IF EXISTS ${table};`);
			}
		} finally {
			db.close();
		}
	} catch {
		console.warn("[db-migrate] FTS5 cleanup raised an error; continuing.");
	}
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const isCli =
	process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
	const args = process.argv.slice(2);
	if (args[0] === "--dev") {
		// Schema-change workflow (`npm run db:migrate -- --name <change>`).
		dropDerivedFtsTables();
		execFileSync("npx", ["prisma", "migrate", "dev", ...args.slice(1)], { stdio: "inherit" });
	} else {
		runMigrations();
	}
}
