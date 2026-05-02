# Token Tracking — Operator Setup

Operator-facing setup guide for Pigeon's token tracking: how to wire the Stop hook, where the snippet goes, and how to debug silent drops. Pairs with the in-app `TokenTrackingSetupDialog` (Pulse strip / Costs page CTA), which renders the same snippet pre-filled with your machine's absolute path.

For the conceptual side — what the recorded numbers mean, how attribution works, the savings formula, pricing decisions, and known limits — see [Cost tracking — how it works](https://2nspired.github.io/pigeon/costs/) (the docs-site `/costs/` page is the canonical narrative).

## Agent coverage

| Agent | Coverage | Notes |
|---|---|---|
| Claude Code | Automatic via Stop hook | Fires on every session exit; matches session `cwd` to the project with the longest matching `repoPath` prefix. |
| Codex | Manual via `recordTokenUsage` MCP tool | Must be called explicitly at session end; same row shape. |
| OpenAI API (no MCP) | No automatic path | Token data isn't available without a Stop-hook equivalent. Use `recordTokenUsage` if you have counts in hand. |

Both paths write to the same `TokenUsageEvent` table; downstream aggregation, attribution, and pricing behave identically regardless of which produced the row.

## Setup — the in-app path (recommended)

Open any project's Costs page (`/projects/[projectId]/costs`) or click "Set up token tracking" from the Pulse strip. The dialog has three numbered steps:

1. **The hook** — copy a `{ "hooks": { "Stop": [...] } }` snippet rendered with the absolute path of *this* server's `scripts/stop-hook.sh` already filled in.
2. **Where it goes** — every `settings.json` Claude Code reads on this machine, marked `configured` or `needs paste`.
3. **Verify** — diagnostics readout: `events recorded`, `last event`, `projects missing repoPath`. Re-check button re-runs the diagnostics tRPC procedure.

That's the fastest path. The rest of this doc is for operators who want to edit the file by hand or are debugging a silent-drop.

## Setup — manual path

1. **Find your stop-hook script.** It's `scripts/stop-hook.sh` inside your local Pigeon clone. The absolute path is what you paste into `command:`.

2. **Add the snippet to one of these `settings.json` files.** Claude Code reads hooks from `settings.json` only — the `hooks` key in `.claude.json` is silently ignored in CC 2.1.x:

   - `$CLAUDE_CONFIG_DIR/settings.json` (when `CLAUDE_CONFIG_DIR` is set)
   - `~/.claude/settings.json` (default user-level install)
   - `~/.claude-alt/settings.json` (side-by-side alt install)
   - `<repo>/.claude/settings.json` (project-level, shared/committed)
   - `<repo>/.claude/settings.local.json` (project-local, gitignored)

3. **The snippet:**

   ```json
   {
     "hooks": {
       "Stop": [
         {
           "hooks": [
             {
               "type": "command",
               "command": "/absolute/path/to/your/pigeon/scripts/stop-hook.sh"
             }
           ]
         }
       ]
     }
   }
   ```

   Use `type: "command"` rather than `type: "mcp_tool"` — the latter no-ops without error in CC 2.1.x for this hook config and would leave you with a valid-looking but silently-broken setup.

4. **Make the script executable.** From your Pigeon clone: `chmod +x scripts/stop-hook.sh`.

5. **End a Claude Code session** (`/exit` or close the conversation). The hook fires on session exit; the next time you open `/projects/[projectId]/costs` you should see the event count tick up.

## Common silent-drop causes

- **`Project.repoPath` not set.** The Stop hook receives the session's `cwd` and matches it to the project with the longest matching `repoPath` prefix. Projects without `repoPath` can't be matched, so their sessions land in `projectsWithoutRepoPath` (visible in the dialog's diagnostics) and produce no events. Fix via the `registerRepo` MCP tool or by editing the project in the web UI.
- **Wrong file.** `.claude.json` is internal Claude Code state — its `hooks` key is ignored. Use `settings.json`.
- **Script not executable.** `chmod +x scripts/stop-hook.sh`.
- **`type: "mcp_tool"` instead of `type: "command"`.** Silently no-ops in CC 2.1.x. Use `command`.

The hook writes a diagnostic line to `<repo>/data/stop-hook.log` on every fire (whether successful or not), so silent failures are debuggable.

## Manual recording (Codex / OpenAI / scripted)

Call `recordTokenUsage` at session end with the counts you have:

```
recordTokenUsage({
  projectId,         // or boardId
  model: "gpt-4o",
  inputTokens: 12345,
  outputTokens: 6789
})
```

Each call creates one new row, so sum your counts before invoking; don't loop.

## Privacy

The hook script extracts only `message.usage` fields (input/output/cache token counts) and `message.model` from the JSONL transcript, plus the same fields from any sibling sub-agent transcripts at `<dirname>/<sessionId>/subagents/agent-*.jsonl`. Message content, tool inputs, and tool outputs are not read or persisted. The hook writes one `TokenUsageEvent` row per (sessionId, model) tuple — that's the entire on-disk artifact.

## See also

- [Cost tracking — how it works](https://2nspired.github.io/pigeon/costs/) — the canonical conceptual doc: five-column token split, attribution + session-expansion rule, Pigeon overhead lens, the savings formula and conservative framing, pricing decisions, limits.
- `AGENTS.md` §Token Tracking — minimal "wire the hook" path.
- `src/server/services/token-usage-service.ts` — the canonical implementation.
- `src/lib/token-pricing-defaults.ts` — `DEFAULT_PRICING` + `PRICING_LAST_VERIFIED`.
- `src/lib/token-tracking-docs.ts` — shared docs target for in-app CTAs.
