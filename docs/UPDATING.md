# Updating Pigeon

One page, written for people who run a local copy. Thomas writes the code; this doc tells you what to do after `git pull`.

> **Installing fresh?** That's one command now: `npx @2nspired/pigeon init`, run from inside your project repo. It clones the latest release into `~/.pigeon` (override with `PIGEON_HOME`), installs deps, migrates the DB, registers the MCP server with Claude Code, binds your repo, and (on macOS) installs the background service. Everything below is about *updating* an install you already have — run these commands in the checkout (`~/.pigeon` if `init` created it).

## The short version

```bash
git pull
npm run service:update   # syncs deps + schema, rebuilds, restarts the launchd service
```

`service:update` is the one command for MINOR and PATCH updates — it runs `npm install`, applies any pending schema migrations, rebuilds the Next.js app, and bootstraps the launchd service. For MAJOR updates, keep reading.

## What `service:update` does, step by step

1. **`npm install`** — picks up any new or bumped dependencies. Prisma's `postinstall` hook regenerates the client.
2. **Apply schema migrations** (`scripts/db-migrate.ts`) — applies any migrations from `prisma/migrations/` that your DB hasn't seen yet, in order, and records each one in the `_prisma_migrations` table. If your install predates migrations (created by `prisma db push`, i.e. no `_prisma_migrations` table yet), the helper first marks the `0_init` baseline as already applied — one-time, automatic, touches no data. The helper applies migrations natively over better-sqlite3 rather than through the Prisma schema engine — the engine refuses to write while any live MCP server holds the DB file, which on a real install is nearly always. It also doesn't drift-check, so the runtime FTS5 index tables (`knowledge_fts` + shadows) no longer need to be dropped on every update.
3. **`npm run build`** — Turbopack production build.
4. **Restart the launchd service** — old process is booted out, new one is bootstrapped at `http://localhost:3100`.
5. **Doctor pass** — post-update health checks; failures surface on the next `briefMe`.

That's it for MINOR and PATCH updates. For MAJOR updates, keep reading.

## Upgrading from v4.x or v5.x (Pigeon rebrand)

The v5.0 rebrand renamed the tool from "project-tracker" to "Pigeon" and added a legacy `project-tracker` config alias. **v6.0 dropped the alias** — any `.mcp.json` still referencing `project-tracker` will fail to connect on v6+ servers.

If you're updating from v4.x or v5.x, run the rebrand migration once before doing anything else:

```bash
npm install
npm run migrate-rebrand    # one-shot: tutorial DB rename + .mcp.json key rewrites + checklist
npm run service:update
```

`migrate-rebrand` is idempotent — safe to re-run. It prints a final checklist for the manual steps it deliberately doesn't auto-execute (e.g. renaming the launchd service label from `com.2nspired.project-tracker` to `com.2nspired.pigeon`). The full v4 → v5 walkthrough (including agent-side `.mcp.json` updates and what changed in tool names) is archived at [`archive/MIGRATING-TO-PIGEON.md`](archive/MIGRATING-TO-PIGEON.md).

## Checking the CHANGELOG first

Before running anything, open `CHANGELOG.md` and find the new version. The sections to care about:

- **Removed** — something you were using may be gone.
- **Changed** — look for `SCHEMA_VERSION` bumps or wire-shape changes.
- **Migration** — if present, lists the exact script to run and the order.

If the release is a **MAJOR** bump (e.g. `2.5.0 → 3.0.0`), the CHANGELOG will call out the breaking changes explicitly and link back here.

## MAJOR updates — back up first

A MAJOR bump means tables are dropping, columns are changing, or migration scripts must run. If something goes wrong mid-update, the rollback is "restore the DB." Back it up:

```bash
cp data/tracker.db data/tracker.db.pre-$(node -p "require('./package.json').version")
```

That copies your DB to `data/tracker.db.pre-3.0.0` (or whatever the target version is). If anything breaks, `cp` it back and you're whole again.

Then run the update in order:

```bash
git pull
npm install
# Run any migration scripts listed in CHANGELOG — ORDER MATTERS.
# Example (from the #86 Note+Claim cutover):
#   npx tsx scripts/migrate-notes-claims.mts
npm run service:update   # applies pending Prisma migrations (incl. destructive ones), rebuilds, restarts
```

Open the UI to sanity-check after:

```bash
npm run db:studio        # eyeball the tables
```

## What each script does

| Command | When to run | What it does |
| --- | --- | --- |
| `npm install` | Every pull | Installs dep changes. Prisma postinstall regenerates the client. |
| `npm run db:migrate:deploy` | Rarely by hand | Applies pending Prisma migrations to `data/tracker.db` (same helper `service:update` runs). Baselines pre-migrations installs automatically. |
| `npm run db:push` | Escape hatch only | Pushes `schema.prisma` directly, bypassing migration history. Don't use it on a migrations-tracked DB unless you know why. |
| `npm run db:studio` | Debugging | Opens Prisma Studio to inspect the DB. Read-only unless you write in the UI. |
| `npm run db:seed` | Fresh install only | Seeds the tutorial project. Idempotent — safe to re-run, does nothing if the tutorial project exists. |
| `npm run service:update` | Every pull (when using the background service) | Syncs deps, applies pending migrations, rebuilds with Turbopack, restarts the launchd service, runs the doctor pass. |
| `npm run service:status` | Sanity check | Shows whether the launchd service is running. |
| `npm run service:logs` | Debugging | Tails stdout/stderr from the service. |

## MCP agent connection

If you're running an MCP agent (Claude, Codex, etc.) against Pigeon, restart the agent after an update — the agent caches the server manifest and will show a `_versionMismatch` warning on `briefMe` until it reconnects.

## When something goes wrong

1. `npm run doctor` — eight-check install-health diagnostic; prints a copy-pasteable fix for every failure (legacy MCP keys, hook drift, launchd label drift, schema-vs-package version skew, WAL pressure, FTS5 half-state, etc.). After every `npm run service:update` this runs automatically and the result surfaces on the next `briefMe` via `_upgradeReport` when anything failed or warned.
2. `npm run service:logs` — read the tail. Most errors show up here.
3. `npm run db:studio` — check the schema matches what the CHANGELOG described.
4. Restore the backup from above if the DB is in a weird state: `cp data/tracker.db.pre-X.Y.Z data/tracker.db && npm run service:update`.
5. Look up the specific failure on the [Troubleshooting page](https://2nspired.github.io/pigeon/troubleshooting/) — covers MCP-not-connecting, `briefMe` failing on missing `repoPath`, schema drift, FTS5 half-state, launchd label drift, stop-hook silently no-op'ing, old MCP tool names, and `_versionMismatch` warnings.
6. If none of that helps, open an issue with the error, the doctor output, and the version you updated from/to.

## If you're behind by multiple versions

CHANGELOG entries describe each step from the previous version to the next. Apply them in order — don't skip. Running migration script for 3.0.0 without having reached 2.5.0 first is not supported and may silently corrupt data.
