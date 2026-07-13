/**
 * Idempotent Prisma migrations helper (#314 Phase A).
 *
 * Replaces `prisma db push` on every install/update path. Decision logic:
 *
 *   - no DB file                          → `prisma migrate deploy` (creates it)
 *   - DB exists, no `_prisma_migrations`  → pre-migrations install (created by
 *     `prisma db push`); `prisma migrate resolve --applied 0_init` marks the
 *     baseline as already applied, then `deploy` applies anything newer
 *   - otherwise                           → `prisma migrate deploy`
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
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
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

export type MigrateStep = "resolve-baseline" | "deploy";

/**
 * Pure decision logic — see the module doc comment for the three branches.
 */
export function planMigrateSteps(dbExists: boolean, migrationsTableExists: boolean): MigrateStep[] {
	if (dbExists && !migrationsTableExists) return ["resolve-baseline", "deploy"];
	return ["deploy"];
}

export interface RunMigrationsOptions {
	/** Project root the Prisma CLI runs in. Defaults to `process.cwd()`. */
	cwd?: string;
	/** Target DB. Defaults to `process.env.DATABASE_URL`, then the live file. */
	databaseUrl?: string;
	log?: (message: string) => void;
	/** Injectable for tests — receives each `npx prisma …` argv. */
	exec?: (argv: string[], opts: { cwd: string; env: NodeJS.ProcessEnv }) => void;
}

/**
 * Apply migrations idempotently. Returns the steps that ran so callers
 * (and tests) can assert on the path taken.
 */
export function runMigrations(options: RunMigrationsOptions = {}): MigrateStep[] {
	const cwd = options.cwd ?? process.cwd();
	const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
	const log = options.log ?? console.log;
	const exec =
		options.exec ??
		((argv: string[], opts: { cwd: string; env: NodeJS.ProcessEnv }) =>
			execFileSync(argv[0], argv.slice(1), { ...opts, stdio: "inherit" }));

	const env = { ...process.env, DATABASE_URL: databaseUrl };
	const dbPath = dbPathFromUrl(databaseUrl, cwd);
	const dbExists = existsSync(dbPath);
	const steps = planMigrateSteps(dbExists, dbExists && hasMigrationsTable(dbPath));

	for (const step of steps) {
		if (step === "resolve-baseline") {
			log(`Existing pre-migrations database detected — baselining as ${BASELINE_MIGRATION}...`);
			exec(["npx", "prisma", "migrate", "resolve", "--applied", BASELINE_MIGRATION], { cwd, env });
		} else {
			log(dbExists ? "Applying pending migrations..." : "Database not found — creating it from migrations...");
			exec(["npx", "prisma", "migrate", "deploy"], { cwd, env });
		}
	}
	return steps;
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
