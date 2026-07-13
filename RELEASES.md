# Pigeon Releases

Human-readable highlights for each release — 3–5 bullets, headline-level only. For the complete change list with card and PR refs, see [CHANGELOG.md](./CHANGELOG.md).

## [Unreleased]

## v6.6.0 — 2026-07-13

- The Daily Squawk — run `/squawk` and Pigeon publishes a newspaper-style digest of recent board activity, rendered as a broadsheet web page with a browsable archive.
- Energy and CO₂ alongside dollars on the Costs page — kWh in the summary, per-row energy in Top Sessions, total energy across handoffs. Estimates only (~±50%), with the methodology written down at `docs/ENERGY-METHODOLOGY.md`.
- Cost attribution got smarter — sessions now credit cards you recently touched or committed against, a backfill script attributes historical unattributed spend, and every handoff shows what it cost.
- Two-tier release notes — `RELEASES.md` (this file) for plain-language highlights; `CHANGELOG.md` keeps the forensic trail with card and PR refs.
- A v7 iteration design spec charts the next direction — Pigeon as "the visible workbench" — with four product-spine slices and a debt ledger.

## v6.5.0 — 2026-05-02

- Added a Code of Conduct (Contributor Covenant 2.1) so the project has a clear standard for participation.
- README hero now switches between light and dark logo art automatically based on your system theme.
- Security vulnerabilities now route through GitHub's private vulnerability reporting (Security tab → "Report a vulnerability") instead of an unspecified email.
- Refreshed docs-site screenshots with real dark-mode captures of the board, card detail, Costs page, and command palette.
- Supported-versions table updated so 6.5.x is current, 6.4.x is best-effort, and pre-6.4 is no longer supported.
