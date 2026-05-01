#!/usr/bin/env -S npx tsx
/**
 * Prints the CLAUDE.md tip block emitted by `scripts/connect.sh`.
 *
 * The essential count, essential names, and extended count are derived
 * from `src/mcp/manifest.ts` + the live extended-tool registry — no
 * hand-maintained numbers in the bash script. (#187)
 */

import { ESSENTIAL_TOOLS } from "../src/mcp/manifest.js";
import "../src/mcp/register-all-tools.js";
import { getAllExtendedTools } from "../src/mcp/tool-registry.js";

export function buildConnectSnippet(): string {
	const essentialCount = ESSENTIAL_TOOLS.length;
	const essentialNames = ESSENTIAL_TOOLS.map((t) => t.name).join(", ");
	const extendedCount = getAllExtendedTools().length;

	return `  ## Project Tracking

  This project uses Pigeon (a kanban board with MCP integration) for context
  continuity across AI sessions.

  **Session lifecycle:** Call \`briefMe()\` at the start of each conversation
  for a one-shot session primer (handoff, top work, blockers, pulse). Call
  \`saveHandoff({ summary, ... })\` before wrapping up — it saves the handoff,
  links new commits, reports touched cards, and returns a copy-pasteable
  resume prompt for the next chat. Both auto-detect the board from your git
  repo — no args needed.

  **Tool architecture:** ${essentialCount} essential tools are always visible (${essentialNames}).
  ${extendedCount} extended tools live behind \`getTools\`/\`runTool\` — including
  getBoard, searchCards, and getRoadmap, which briefMe composes internally.
  Call \`getTools()\` with no args to see all categories.

  **Basics:** Reference cards by #number (e.g. "working on #7"). Move cards to
  reflect progress. Use \`addComment\` for decisions and blockers. Call
  \`saveHandoff\` to save a handoff so the next conversation picks up in context.

  **Intent on writes:** \`moveCard\` and \`deleteCard\` require a short \`intent\`
  string (≤120 chars) explaining *why* — humans watching the board read it live
  in the activity strip and card banner. \`updateCard\` accepts it optionally;
  pass one when the edit reflects a decision, skip it for mechanical fixes.`;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
	process.stdout.write(`${buildConnectSnippet()}\n`);
}
