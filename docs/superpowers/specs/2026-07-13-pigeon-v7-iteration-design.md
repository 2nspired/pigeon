# Pigeon v7 Iteration — Design Spec

**Date:** 2026-07-13
**Status:** Approved in brainstorm; pending written-spec review
**Supersedes:** the 2026-05-12 "career artifact / editorial launch sprint" direction (cards #302–#313 are dispositioned in §10, not silently orphaned)

---

## 1. Context & Problem

Pigeon is an open-source, local-first kanban + MCP server for AI-assisted development. It is used daily by its maintainer and a small group of early users, whose feedback is that it "changed the way they work." The tool embodies a working paradigm that is genuinely new:

- **The card is the full context container** — story, plan, comments, decisions (ADRs), and cost live on the work item itself. No round-trips to Obsidian/Notion/wikis for plans that won't age well anyway.
- **Agents are scoped to cards**, not handed huge vague tasks.
- **Humans comment asynchronously on future work**, and those comments surface when the work happens.
- **Session continuity is visible** — you see where you left off on a board, not by recalling which terminal conversation it was.

The core problem is **adoption, not capability**: Jira-native people don't arrive believing this paradigm, and the product does not currently teach it. Current positioning ("session management") undersells the actual story ("the work is visible"). Secondary problems: iteratively-built inconsistencies (technical debt, piecemeal UI), and a hard wall for the first team prospect (no multi-user support at all).

### Research inputs (2026-07-13, six parallel workstreams)

1. **Services-layer teardown** — bones worth evolving; ~half the domains (card, board, note, checklist, comment) never migrated to `src/lib/services/` and are implemented twice with divergent behavior.
2. **MCP-surface teardown** — the essential/extended split is genuinely strong (~85% standing token reduction); taxonomy has drifted; `briefMe`/`saveHandoff`/`tracker.md` policy enforcement are real differentiators with no competitor equivalent.
3. **Web/UI teardown** — disciplined optimistic-update and token architecture; a 1,077-line card-detail monolith, duplicated DnD, duplicated Notes, orphaned IA.
4. **Data-model teardown** — Claim unification and lazy staleness are strong designs; session-identity gap, cost double-count race, no migrations directory, free-text identity everywhere.
5. **Live UX audit** (Chrome DevTools + Lighthouse against the running service) — a11y 89 / agentic-browsing 50 with two recurring root causes; cross-view consistency breaks; the differentiators (Roadmap, Decisions, Handoffs, Costs, Squawk) confirmed as category-unique but hidden.
6. **Competitive research (July 2026)** — Linear is executing this thesis at team scale but is cloud-only with **no first-party Claude Code integration**; Vibe Kanban (nearest analog) shut down 2026-04-10 after failing to monetize a free local tool; board-attached, supersession-aware memory is a genuine open moat; the shadcn playbook (one-command install + MCP as distribution) is the adoption reference; PowerSync is the aligned future sync path, CRDTs are overkill.

## 2. Positioning

> **Pigeon is the visible workbench for AI-paired development.** The card is the container: story, plan, comments, decisions, and cost live on the work itself. Humans see what agents believe and correct it where they'd naturally encounter it. Local-first, open-source, Claude Code-native.

Session continuity is a *proof* of the thesis, not the headline. "Session management" framing is retired.

**Audience decision:** Claude Code-native first. The generic MCP surface remains the floor for all clients (Cursor, Codex work today and keep working); native depth — skills, hooks, transcript-aware costs, install flow — is where investment goes. This occupies the seam Linear left open.

**Evolution decision:** evolve in place (no greenfield v2). Daily users and momentum are not forfeited; hosted-readiness seams are carved so a future team edition is an extension, not a rewrite (strangler-fig, not second-system).

## 3. Operating Principles

1. **The card is the container.** Features that strengthen card-as-context are on-thesis; anything that pulls context off the card is wrong.
2. **The work is visible.** If the human can't see it and correct it in the surface where they'd naturally encounter it, the agent shouldn't trust it.
3. **The agent teaches.** Onboarding is a conversation demonstrating the paradigm on the user's own repo, not a manual.
4. **Familiar shell, distinctive soul.** Board mechanics, keyboard patterns, and IA read as standard (Jira/Linear/GH Projects muscle memory works). Pigeon's identity lives in voice, typography, and its one-of-a-kind surfaces (card, handoff, Squawk).
5. **Every slice ships a wow and empties its territory's debt.** A slice is not done while a ledger item assigned to it is open.
6. **Claude Code-native first, MCP floor for all.**
7. **Carve hosted seams, don't build hosted features.** Identity model, migrations, service factories make the pay leg cheap; we don't build it now.
8. **Responsive at every width.** Half-screen beside a terminal is a first-class citizen; every surface defines what it shows as width grows (not just what it hides as width shrinks).

**Standing rules:**
- **Dogfooding:** all v7 work is tracked on the Pigeon Dev board — milestones per slice, cards planned via `planCard`, moves with intent, sessions end in handoffs, decisions recorded. Friction encountered becomes cards. The build of v7 is itself the reference demonstration (and slice 4's demo material).
- **Docs are continuous:** the GitHub README is the de-facto landing page shared today; it updates as each slice lands (screenshots, quickstart). Slice 4 is the full narrative rewrite, not the first touch.

## 4. Debt Ledger

Every item is assigned to exactly one slice. The ledger reaches zero at the end of Slice 4; the boundary-lint baseline reaches zero at the end of Slice 3. No item may be silently deferred — removing one from scope requires an explicit decision recorded on the board.

| # | Debt item | Slice |
|---|---|---|
| D1 | No Prisma migrations directory; schema evolves by `db push` only — no history, no upgrade path | 1 |
| D2 | MCP tool taxonomy drift: 13-tool "context" grab-bag; no structured `deprecated` flag; `planCard` "tool not found" trap | 1 |
| D3 | Card domain implemented twice (web + MCP) with divergent move semantics; non-transactional create paths | 2 |
| D4 | `card-detail-sheet.tsx` 1,077-line monolith on the highest-traffic surface | 2 |
| D5 | Kanban/list views duplicate ~250 lines of DnD logic | 2 |
| D6 | Notes duplicated ~90% between global page and project tab | 2 |
| D7 | No shared ServiceResult→TRPCError mapper (~70 hand-written copies; 404s surface as 500s) | 2 |
| D8 | `ServiceResult` type lives under `src/server/`; `lib→server/mcp` edges invisible to boundary lint | 2 |
| D9 | Semantic-token gaps (raw palette beside token system); Squawk/Costs orphaned from nav | 2 |
| D10 | Session-identity gap: Claude Code session UUID ↔ MCP SESSION_ID never correlated; concurrent sessions can cross-attribute | 3 |
| D11 | `TokenUsageEvent` has no unique `(sessionId, model)` constraint — silent cost double-count race | 3 |
| D12 | `briefMe` payload builder lives in Next.js layer; grandfathered MCP import spins up a second Prisma client in-process | 3 |
| D13 | Free-text actor identity everywhere; no Actor/User model (the team-edition seam) | 3 |
| D14 | No `busy_timeout`/retry on dual-process SQLite; FTS layer in wrong architectural home | 3 |
| D15 | OSS professionalization: CONTRIBUTING depth, security policy, issue templates, release hygiene | 4 |
| D16 | A11y/agent-operability floor: contrast token + accessible-name pattern for icon buttons + form-field labeling (two root causes, app-wide; Lighthouse a11y 89 → target ≥95, agentic 50 → ≥90) | 2 |
| D17 | Cross-view consistency contract: one source of truth for column order, card metadata display, project identity — lint-tested | 2 |

## 5. Slice 1 — First Contact

**Goal:** stranger → their agent working from a card in their own repo in under five minutes; the paradigm teaches itself.

1. **One-command install.** `npx pigeon init` (shadcn playbook): creates the database from versioned migrations (D1 — `prisma migrate` with a baseline migration; `db push` retired from the install path), registers the MCP server in Claude Code, writes a starter `tracker.md`, installs the `/brief-me`, `/handoff`, `/plan-card` skills. Existing `npm run setup` wizard and card #154 fold in.
2. **The agent teaches.** First `briefMe` on a fresh board returns a teaching payload: the agent explains the paradigm conversationally, offers to scan the repo (README, recent commits), proposes the first board with real cards from observed work, and plans one card with the four locked sections as a live demonstration. Builds on `checkOnboarding`/`seedTutorial`, redesigned as a narrative protocol.
3. **Human-side first-run tour.** Three dismissible beats on the seeded board: "this plan was written by your agent," "comment here and the next session sees it," "this is where you'll see what it cost." Suggests the side-by-side layout explicitly.
4. **MCP surface hygiene (D2).** Split the `context` category (knowledge / context / digest); add structured `deprecated` annotation surfaced in `getTools`; promote `planCard` to essential (plus a `briefMe` hint when the top work item lacks a plan).
5. **Quickstart docs.** README install section shrinks to three lines; paradigm story moves up front (interim pass; full rewrite is Slice 4).

**Acceptance:** (a) fresh-machine install → first agent session < 5 minutes, timed; (b) a Jira-native friend completes onboarding unassisted and can explain "card as container" afterward; (c) migrations baseline committed; (d) zero "tool not found" traps on the documented workflow.

## 6. Slice 2 — The Card

**Goal:** the card becomes the hero surface that *is* the pitch; every view agrees with every other view; the whole UI conforms to one ratified design language. Largest slice.

1. **Design-language lock (gate — first).** One decision document ratified in `/dev/design`: typography + voice (open question decided here: does Squawk's editorial soul extend product-wide in a moderated register, while the shell stays clean and familiar? Linear/Plane/Jira are all clinical-minimal — editorial is unclaimed territory); density/spacing; motion; empty/loading/error patterns; responsive behavior contract (principle 8); non-negotiable a11y floor (D16 root causes fixed at token/component level). Includes the **cross-view consistency contract** (D17) with a lint test: column order, card metadata display, and project identity have one source of truth.
2. **Card detail redesigned as the hero (D4).** Monolith rebuilt as composed sections (the proven costs-page pattern; no component over ~300 lines): story, structured plan (four locked sections rendered as structure, not markdown wall), comments, linked decisions, relations, checklist, per-card cost strip, activity. A stranger opening one card should understand the product.
3. **Board mechanics parity (D3, D5, D16).** One shared `useBoardDnd` hook; unified transactional card service in `src/lib/services/` consumed by web and MCP (one move algorithm); keyboard-drag visual glitch fixed; invisible-on-focus kebab fixed; comment counts consistent across views.
4. **Dashboards that earn their existence.** Metric set rebuilt from evidence (benchmarks: GitHub Projects insights, Linear insights). Driving questions: *Rudy at a glance* — what are my agents doing now, what's blocked, what shipped this week, what did it cost; *PO planning* — milestone progress, what's next, what's stale. Widgets that answer no actionable question are deleted. Wide viewports get denser tile/list treatments (principle 8).
5. **Notes consolidated and connected (D6).** One `NotesWorkspace` (global + project-scoped); `[[#42]]` references that resolve, render as chips, and backlink from the card (Obsidian-lite; full graph features out of scope).
6. **IA repair (D9).** Squawk and Costs enter primary navigation; Hygiene surfaced.
7. **Router/lint hygiene (D7, D8).** Shared `unwrapServiceResult` mapper; `ServiceResult` moves to `src/lib/`; boundary lint gains `lib→server` / `lib→mcp` rules.

**Acceptance:** (a) design-language doc ratified, `/dev/design` Surfaces built; (b) Lighthouse a11y ≥ 95 and agentic-browsing ≥ 90 on board + card detail; (c) consistency lint green in CI; (d) card detail decomposed, no component > ~300 lines; (e) one dashboard the maintainer verifiably uses daily after two weeks of dogfooding; (f) unified card service landed (one move algorithm, transactional, shared).

## 7. Slice 3 — The Session

**Goal:** "see where you left off" becomes visceral; every session number (cost, energy, attribution) becomes true; the team-edition seams get carved.

1. **Session identity (D10).** `SessionCorrelation` record binding Claude Code session UUID ↔ MCP SESSION_ID, written where both IDs are already in scope (transcript ingestion). Attribution signals upgrade from temporal proximity to identity.
2. **Numbers that can't lie (D11).** Unique `(sessionId, model)` constraint + atomic upsert.
3. **Identity model (D13).** `Actor` model (human | agent, stable ID, display name), backfilled; tRPC context gains an auth-ready `ctx.actor` slot defaulting to the local owner. No auth behavior (principle 7). This is deliberately the only Slice-5 work in this iteration.
4. **Costs as signature feature.** Per-card cost + energy/CO₂ first-class (card cost strip becomes trustworthy); per-milestone rollup ("v7.0 cost $X and Y kWh to ship") shown on the roadmap view; honest confidence labeling (attributed vs. estimated, shown); energy keeps its ±50% honesty. The claim nobody else can make: "what did this feature cost to build with AI."
5. **Session presence + handoff readability.** Live session presence on the board (which card, who, how long); handoff timeline redesigned for scannability (what happened / what's next / what it cost) instead of prose walls.
6. **Decisions that age with the code.** One-way idempotent export of accepted decisions to `docs/adr/` as numbered markdown ADRs (board is the living index; git owns the durable artifact). Knowledge-clarity rule decided: **comments are conversation, claims are asserted facts**, with a comment→claim promotion path.
7. **Plumbing to zero (D12, D14).** `buildBriefPayload` → `src/lib/services/`; FTS → its correct home; `busy_timeout` + retry wrapper; boundary baseline = 0, new lint rules in CI.

**Acceptance:** (a) two concurrent sessions on one project attribute correctly — tested; (b) cost totals survive manual audit against transcript data; (c) per-milestone cost rollup on the roadmap view; (d) decision export produces valid ADRs in this repo; (e) boundary baseline 0 + lint rules in CI; (f) session presence visible during a real working session.

## 8. Slice 4 — The Story

**Goal:** the outside world's first five minutes match the product's first five minutes.

1. **README as landing page.** Full rewrite led by the paradigm story in one screenshot-annotated scroll; three-line quickstart; "session management" framing retired.
2. **The meta-story is the demo.** v7 was built on Pigeon and the receipts are public: the launch story links the actual board — real agent-written plans, the handoff chain, the decision log, and the real cost rollup ("v7 cost $X and Y kWh to build").
3. **Two-minute demo video.** One tight loop: `briefMe` → pick up card → plan appears on card → work → handoff → human comments on a future card → next session picks it up.
4. **Docs site refresh + launch moment.** Positioning pass on the docs site; Show HN / launch post framed on the meta-story and the cost-per-feature claim.
5. **OSS professionalization (D15).** CONTRIBUTING depth, security policy, issue templates, release hygiene. (Code of Conduct content is drafted with maintainer input, not auto-generated.)

**Acceptance:** (a) a stranger reading only the README can explain the paradigm; (b) demo video live; (c) launch post published linking the real board; (d) debt ledger = 0.

## 9. Slice 5 — The Team (outline only; post-iteration)

**Shared single instance**: one self-hosted Pigeon (LAN/Tailscale), small team. Auth in front of the Slice-3 Actor model; per-user attribution; MCP connection story for teammates (HTTP transport or per-user tokens). No sync engine (PowerSync-class local-first sync is future-future). Natural pay-leg seam. Gets a milestone and placeholder cards now; designed later.

## 10. Board Reconciliation & Existing-Card Disposition

Before any code moves: milestones *v7.0 First Contact / v7.1 The Card / v7.2 The Session / v7.3 The Story* + *The Team* (future) created; slice work items and D-items become cards (debt cards tagged `debt` with D-numbers); big cards get `planCard` before work starts; a decision claim is recorded superseding the 2026-05-12 "career artifact / editorial sprint" pivot.

Provisional disposition of #299–#313 (finalized on the board; every card gets a comment explaining its fate):

| Card | Disposition |
|---|---|
| #301 comment-fetch bug (asc + take:50) | **Keep — fix immediately** (pre-slice) |
| #302 cut v6.6.0 release | **Keep — do first**; ship pending unreleased work before v7 begins |
| #303 visual smoke | **Supersede** — 2026-07-13 live UX audit did this deeper; findings linked |
| #304 tokens / #306 board retouch | **Fold into Slice 2** design-language lock (editorial question decided, not assumed) |
| #309 costs reframe | **Fold into Slice 3** |
| #310 first-run polish | **Fold into Slice 1** |
| #311 landing / #313 Show HN | **Fold into Slice 4** |
| #299 Flock / #300 Pulsar | **Re-triage to Parking Lot** — not in this iteration's story |
| Remaining #305/#307/#308/#312 | Dispositioned individually on the board against slice scopes |

**Future cards (Parking Lot):** graph visualization of work + connections (builds on relations + `[[card]]` linking); team edition epic (Slice 5).

## 11. Out of Scope (this iteration)

Greenfield rewrite; auth/login UI; sync engines/CRDTs; agent-agnostic feature depth beyond the MCP floor; full Obsidian-grade knowledge graph; hosted SaaS anything.

## 12. Risks

- **Slice 2 is the largest and riskiest** — the design-language lock gates it to prevent piecemeal redesign; if it slips, slices are re-scoped rather than the gate dropped.
- **Solo-maintainer bandwidth** — slice order is also a value order; each slice ends in a shippable, publishable state, so the iteration survives interruption at any slice boundary.
- **Editorial-voice bet** — decided with evidence at the design-language lock, not assumed; the fallback (clean shell + editorial reserved for Squawk/voice surfaces) is explicitly acceptable.
- **Adoption acceptance criteria involve other humans** (the Jira-native friend test) — schedule them early in each slice, not at the end.
