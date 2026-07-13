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
 * `runMigrations` takes an injectable `exec`, so the tests assert the exact
 * Prisma CLI invocations without spawning a real `npx prisma`. Real SQLite
 * files (via better-sqlite3, in a temp dir) back the table-existence check.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	BASELINE_MIGRATION,
	dbPathFromUrl,
	dropDerivedFtsTables,
	hasMigrationsTable,
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

type ExecCall = { argv: string[]; env: NodeJS.ProcessEnv };

function captureExec(): { calls: ExecCall[]; exec: (argv: string[], opts: { cwd: string; env: NodeJS.ProcessEnv }) => void } {
	const calls: ExecCall[] = [];
	return {
		calls,
		exec: (argv, opts) => calls.push({ argv, env: opts.env }),
	};
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
	it("fresh install: runs deploy only", () => {
		const { calls, exec } = captureExec();
		const steps = runMigrations({
			cwd: dir,
			databaseUrl: "file:./missing.db",
			exec,
			log: silent,
		});

		expect(steps).toEqual(["deploy"]);
		expect(calls.map((c) => c.argv)).toEqual([["npx", "prisma", "migrate", "deploy"]]);
	});

	it("pre-migrations DB: resolves the baseline as applied, then deploys", () => {
		createPushStyleDb(join(dir, "tracker.db"));
		const { calls, exec } = captureExec();
		const steps = runMigrations({
			cwd: dir,
			databaseUrl: "file:./tracker.db",
			exec,
			log: silent,
		});

		expect(steps).toEqual(["resolve-baseline", "deploy"]);
		expect(calls.map((c) => c.argv)).toEqual([
			["npx", "prisma", "migrate", "resolve", "--applied", BASELINE_MIGRATION],
			["npx", "prisma", "migrate", "deploy"],
		]);
	});

	it("already-baselined DB: runs deploy only", () => {
		createBaselinedDb(join(dir, "tracker.db"));
		const { calls, exec } = captureExec();
		const steps = runMigrations({
			cwd: dir,
			databaseUrl: "file:./tracker.db",
			exec,
			log: silent,
		});

		expect(steps).toEqual(["deploy"]);
		expect(calls.map((c) => c.argv)).toEqual([["npx", "prisma", "migrate", "deploy"]]);
	});

	it("passes the target DATABASE_URL through to the Prisma CLI env", () => {
		const { calls, exec } = captureExec();
		runMigrations({ cwd: dir, databaseUrl: "file:./scratch.db", exec, log: silent });
		expect(calls[0].env.DATABASE_URL).toBe("file:./scratch.db");
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
