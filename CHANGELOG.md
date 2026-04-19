# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/) — see `docs/VERSIONING.md` for the rules we apply.

Each release links to the tracker card(s) that drove it; the tracker is the single source of truth for rationale.

## [Unreleased]

## [3.0.0] — 2026-04-19

Destructive tail of the Note+Claim cutover (#86). Five legacy tables drop; the unified `Claim` + extended `Note` are the only knowledge surfaces left. No wire-shape changes to MCP tools or tRPC routers — adapters were landed in earlier commits.

### Migration — REQUIRED before `db:push`

Run the backfill once more before applying the 3.0.0 schema, even if you ran it on 2.4.0:

```bash
npx tsx scripts/migrate-notes-claims.mts
npm run db:push   # drops the 5 legacy tables
```

The backfill is idempotent — rows already migrated are skipped. The script now reads legacy tables via raw SQL so it survives the drop.

### Removed

- `SessionHandoff` table — replaced by `Note(kind="handoff")`. (#86)
- `Decision` table — replaced by `Claim(kind="decision")`. (#86)
- `PersistentContextEntry` table — replaced by `Claim(kind="context")`. (#86)
- `CodeFact` table — replaced by `Claim(kind="code")`. (#86)
- `MeasurementFact` table — replaced by `Claim(kind="measurement")`. (#86)

### Changed

- `SCHEMA_VERSION` 8 → 9.
- `MCP_SERVER_VERSION` 2.5.0 → 3.0.0.
- `getCard` MCP tool now reads decisions from `Claim` (same response shape — `{id, title, status}`).

### Added

- `docs/VERSIONING.md`, `docs/UPDATING.md`, this CHANGELOG. (#101)
- `scripts/release.ts` — version-agreement + tag automation. (#101)

## [2.5.0] — 2026-04-17

The Note table widens to carry any author/kind/metadata payload. Still additive — legacy shape-only callers continue to work.

### Added

- `Note` table gains `kind`, `author`, `cardId`, `boardId`, `metadata`, `expiresAt` as optional columns. (#86)
- `createNote` / `listNotes` / `updateNote` tools accept the new fields; `listNotes` filters by `kind`, `cardId`, `boardId`, `author`. (#86)
- tRPC `note.list` accepts the same filter set.

### Changed

- `SCHEMA_VERSION` 6 → 7.
- `MCP_SERVER_VERSION` 2.4.0 → 2.5.0.

## [2.4.0] — 2026-03 (Claim table shipped)

First cut of the unified knowledge primitive — the `Claim` row type, with MCP tools to write and list.

### Added

- `Claim` table — `kind`, `projectId`, `statement`, `body`, `evidence` (JSON), `payload` (JSON), `author`, `cardId`, `status`, `supersedesId`, `supersededById`, `recordedAtSha`, `verifiedAt`, `expiresAt`. (#86)
- `saveClaim`, `listClaims` MCP tools. (#86)

### Changed

- `SCHEMA_VERSION` 5 → 6.
- `MCP_SERVER_VERSION` 2.3.0 → 2.4.0.

## [2.3.0] — 2026-02 (session continuity)

### Added

- `endSession` essential MCP tool — wraps handoff save + summary emission for clean agent shutdown. (#62)
- `briefMe` essential tool (session primer with pulse, handoff, top work, open decisions).

### Changed

- `MCP_SERVER_VERSION` 2.2.0 → 2.3.0.

## Before 2.3.0

Earlier history is captured in the git log. Highlights:

- Phase 3 ship (UI: command palette, SSE real-time updates, optimistic UI).
- AI Context Engine (20 tools, 5 models, MCP resources, version detection).
- Initial local-first kanban board with MCP integration.

Reconstructed entries below this point are best-effort; treat git log as authoritative.

[Unreleased]: https://github.com/2nspired/project-tracker/compare/v3.0.0...HEAD
[3.0.0]: https://github.com/2nspired/project-tracker/releases/tag/v3.0.0
[2.5.0]: https://github.com/2nspired/project-tracker/releases/tag/v2.5.0
[2.4.0]: https://github.com/2nspired/project-tracker/releases/tag/v2.4.0
[2.3.0]: https://github.com/2nspired/project-tracker/releases/tag/v2.3.0
