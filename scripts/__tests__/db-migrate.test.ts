// @vitest-environment node
/**
 * Tests for the idempotent migrations helper (#314 Phase A).
 *
 * Pins the three-branch decision logic that replaces `prisma db push` on
 * every install/update path:
 *   1. Fresh install (no DB file)            → deploy only
 *   2. Pre-migrations DB (no `_prisma_migrations` table — a `db push`
 *      install) → resolve `0_init` as applied, then deploy
 *   3. Already-baselined DB                  → deploy only
 *
 * The helper is fully native (better-sqlite3, no Prisma CLI spawns — the
 * schema engine can't write while any MCP server connection has touched the
 * DB), so the tests run it end-to-end against real SQLite files in a temp
 * dir and assert on the resulting schema + `_prisma_migrations` ledger.
 */

import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	BASELINE_MIGRATION,
	dbPathFromUrl,
	dropDerivedFtsTables,
	hasMigrationsTable,
	markBaselineApplied,
	planMigrateSteps,
	runMigrations,
} from "../db-migrate";

// ─── Fixture helpers ───────────────────────────────────────────────

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "db-migrate-test-"));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

/** Create a SQLite file that looks like a `prisma db push` install. */
function createPushStyleDb(path: string): void {
	const db = new Database(path);
	db.exec('CREATE TABLE "project" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL);');
	db.exec("INSERT INTO project (id, name) VALUES ('p1', 'Pigeon');");
	db.close();
}

/** Create a SQLite file that already has Prisma's migrations table. */
function createBaselinedDb(path: string): void {
	createPushStyleDb(path);
	const db = new Database(path);
	db.exec('CREATE TABLE "_prisma_migrations" ("id" TEXT NOT NULL PRIMARY KEY);');
	db.close();
}

const BASELINE_SQL = 'CREATE TABLE "project" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL);\n';

/** Write a fake `prisma/migrations/0_init/migration.sql` under `root`. */
function createMigrationsDir(root: string): string {
	const migrationsDir = join(root, "prisma", "migrations");
	mkdirSync(join(migrationsDir, BASELINE_MIGRATION), { recursive: true });
	writeFileSync(join(migrationsDir, BASELINE_MIGRATION, "migration.sql"), BASELINE_SQL);
	return migrationsDir;
}

/** Add a timestamped migration after the baseline. */
function addMigration(migrationsDir: string, name: string, sql: string): void {
	mkdirSync(join(migrationsDir, name), { recursive: true });
	writeFileSync(join(migrationsDir, name, "migration.sql"), sql);
}

function tableNames(path: string): string[] {
	const db = new Database(path, { readonly: true });
	try {
		return (
			db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
				name: string;
			}>
		).map((r) => r.name);
	} finally {
		db.close();
	}
}

function readLedger(path: string): Array<Record<string, unknown>> {
	const db = new Database(path, { readonly: true });
	try {
		return db.prepare("SELECT * FROM _prisma_migrations").all() as Array<
			Record<string, unknown>
		>;
	} finally {
		db.close();
	}
}

const silent = () => {};

// ─── planMigrateSteps (pure decision logic) ────────────────────────

describe("planMigrateSteps", () => {
	it("fresh install (no DB) → deploy only", () => {
		expect(planMigrateSteps(false, false)).toEqual(["deploy"]);
	});

	it("existing DB without _prisma_migrations → baseline then deploy", () => {
		expect(planMigrateSteps(true, false)).toEqual(["resolve-baseline", "deploy"]);
	});

	it("already-baselined DB → deploy only", () => {
		expect(planMigrateSteps(true, true)).toEqual(["deploy"]);
	});
});

// ─── dbPathFromUrl ─────────────────────────────────────────────────

describe("dbPathFromUrl", () => {
	it("strips the file: scheme and resolves relative to cwd", () => {
		expect(dbPathFromUrl("file:./data/tracker.db", "/srv/pigeon")).toBe(
			resolve("/srv/pigeon", "data/tracker.db"),
		);
	});

	it("keeps absolute paths untouched", () => {
		expect(dbPathFromUrl("file:/var/db/tracker.db", "/elsewhere")).toBe("/var/db/tracker.db");
	});

	it("accepts a bare path without a scheme", () => {
		expect(dbPathFromUrl("data/tracker.db", "/srv/pigeon")).toBe(
			resolve("/srv/pigeon", "data/tracker.db"),
		);
	});
});

// ─── hasMigrationsTable ────────────────────────────────────────────

describe("hasMigrationsTable", () => {
	it("false for a push-style DB", () => {
		const path = join(dir, "push.db");
		createPushStyleDb(path);
		expect(hasMigrationsTable(path)).toBe(false);
	});

	it("true once _prisma_migrations exists", () => {
		const path = join(dir, "baselined.db");
		createBaselinedDb(path);
		expect(hasMigrationsTable(path)).toBe(true);
	});
});

// ─── runMigrations (composed, with injected exec) ──────────────────

describe("runMigrations", () => {
	it("fresh install: creates the DB and applies every migration natively", () => {
		createMigrationsDir(dir);
		const result = runMigrations({ cwd: dir, databaseUrl: "file:./data/tracker.db", log: silent });

		expect(result.steps).toEqual(["deploy"]);
		expect(result.baselined).toBe(false);
		expect(result.applied).toEqual([BASELINE_MIGRATION]);
		expect(tableNames(join(dir, "data", "tracker.db"))).toContain("project");

		const rows = readLedger(join(dir, "data", "tracker.db"));
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			migration_name: BASELINE_MIGRATION,
			checksum: createHash("sha256").update(BASELINE_SQL).digest("hex"),
			logs: null,
			applied_steps_count: 1,
		});
	});

	it("pre-migrations DB: baselines 0_init, then applies only the newer migrations", () => {
		createPushStyleDb(join(dir, "tracker.db"));
		const migrationsDir = createMigrationsDir(dir);
		addMigration(migrationsDir, "20260714000000_add_widget", 'CREATE TABLE "widget" ("id" TEXT PRIMARY KEY);');

		const result = runMigrations({ cwd: dir, databaseUrl: "file:./tracker.db", log: silent });

		expect(result.steps).toEqual(["resolve-baseline", "deploy"]);
		expect(result.baselined).toBe(true);
		// 0_init is marked applied (not re-executed — the tables already exist);
		// only the newer migration actually runs.
		expect(result.applied).toEqual(["20260714000000_add_widget"]);

		const tables = tableNames(join(dir, "tracker.db"));
		expect(tables).toContain("project");
		expect(tables).toContain("widget");

		const rows = readLedger(join(dir, "tracker.db"));
		expect(rows.map((r) => [r.migration_name, r.applied_steps_count])).toEqual([
			[BASELINE_MIGRATION, 0],
			["20260714000000_add_widget", 1],
		]);
		// Pre-existing data survives.
		const db = new Database(join(dir, "tracker.db"), { readonly: true });
		expect(db.prepare("SELECT count(*) AS n FROM project").get()).toEqual({ n: 1 });
		db.close();
	});

	it("already-baselined, up-to-date DB: no-ops", () => {
		createMigrationsDir(dir);
		runMigrations({ cwd: dir, databaseUrl: "file:./tracker.db", log: silent });
		const second = runMigrations({ cwd: dir, databaseUrl: "file:./tracker.db", log: silent });

		expect(second.steps).toEqual(["deploy"]);
		expect(second.applied).toEqual([]);
		expect(readLedger(join(dir, "tracker.db"))).toHaveLength(1);
	});

	it("refuses to run when an applied migration was edited (checksum mismatch)", () => {
		const migrationsDir = createMigrationsDir(dir);
		runMigrations({ cwd: dir, databaseUrl: "file:./tracker.db", log: silent });
		writeFileSync(join(migrationsDir, BASELINE_MIGRATION, "migration.sql"), "-- edited\n");

		expect(() => runMigrations({ cwd: dir, databaseUrl: "file:./tracker.db", log: silent })).toThrow(
			/checksum mismatch/,
		);
	});

	it("throws when the migrations directory is missing or empty", () => {
		expect(() => runMigrations({ cwd: dir, databaseUrl: "file:./tracker.db", log: silent })).toThrow(
			/No migrations found/,
		);
	});
});

// ─── markBaselineApplied ───────────────────────────────────────────

describe("markBaselineApplied", () => {
	it("creates the ledger with Prisma's shape and a checksum of the migration script", () => {
		const path = join(dir, "tracker.db");
		createPushStyleDb(path);
		const migrationsDir = createMigrationsDir(dir);

		markBaselineApplied({ dbPath: path, migrationsDir });

		const rows = readLedger(path);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			migration_name: BASELINE_MIGRATION,
			checksum: createHash("sha256").update(BASELINE_SQL).digest("hex"),
			logs: "",
			rolled_back_at: null,
			applied_steps_count: 0,
		});
		expect(rows[0].id).toBeTruthy();
		expect(rows[0].finished_at).toBeTruthy();
	});

	it("is idempotent — a second call leaves a single row", () => {
		const path = join(dir, "tracker.db");
		createPushStyleDb(path);
		const migrationsDir = createMigrationsDir(dir);

		markBaselineApplied({ dbPath: path, migrationsDir });
		markBaselineApplied({ dbPath: path, migrationsDir });

		expect(readLedger(path)).toHaveLength(1);
	});

	it("throws when the DB file is missing (never creates one as a side effect)", () => {
		const migrationsDir = createMigrationsDir(dir);
		expect(() =>
			markBaselineApplied({ dbPath: join(dir, "missing.db"), migrationsDir }),
		).toThrow();
	});
});

// ─── dropDerivedFtsTables ──────────────────────────────────────────

describe("dropDerivedFtsTables", () => {
	it("drops the runtime FTS5 index tables and leaves source tables intact", () => {
		const path = join(dir, "tracker.db");
		createPushStyleDb(path);
		const db = new Database(path);
		db.exec("CREATE VIRTUAL TABLE knowledge_fts USING fts5(content);");
		db.close();

		dropDerivedFtsTables({ cwd: dir, databaseUrl: "file:./tracker.db" });

		const check = new Database(path, { readonly: true });
		const tables = check
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
			.all()
			.map((row) => (row as { name: string }).name);
		check.close();

		expect(tables).toContain("project");
		expect(tables.filter((t) => t.startsWith("knowledge_fts"))).toEqual([]);
	});

	it("no-ops when the DB file does not exist", () => {
		expect(() =>
			dropDerivedFtsTables({ cwd: dir, databaseUrl: "file:./missing.db" }),
		).not.toThrow();
	});
});
