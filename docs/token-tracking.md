# Token Tracking

Long-form reference for Pigeon's token tracking and cost-surfacing features. Pairs with the in-app `TokenTrackingSetupDialog` and the AGENTS.md §Token Tracking section — that section gives the minimal "wire the hook" path; this document explains every surface, formula, and FAQ in full.

## 01 — Overview

Pigeon records per-session token usage per (project, model) and surfaces the cost on cards, in the Pulse strip, in `briefMe`, and on the per-project Costs page (`/projects/[projectId]/costs`). The same rows back the "Pigeon paid for itself" savings lens, the Pigeon overhead lens, and the cost-per-shipped-card lens. Pricing is provider-agnostic with five rate fields (`inputPerMTok`, `outputPerMTok`, `cacheReadPerMTok`, `cacheCreation1hPerMTok`, `cacheCreation5mPerMTok`) so Anthropic prompt-cache pricing fidelity is preserved alongside OpenAI-shaped flat input/output pricing.

Tracking is **local-first and opt-in**. Pigeon reads only token usage metadata written by Claude Code's Stop hook — never transcript content. The hook script streams the JSONL transcript line-by-line and sums `message.usage` fields per `message.model`; nothing else from the transcript is read or persisted. Sessions from agents without a Stop hook (Codex, custom MCP clients) flow through the manual `recordTokenUsage` MCP tool and never touch a transcript at all.

## 02 — Agent coverage matrix

| Agent | Coverage | Notes |
|---|---|---|
| Claude Code | Automatic via Stop hook | Fires on every session exit; records to closest matched Project by `repoPath`. |
| Codex | Manual via `recordTokenUsage` MCP tool | Must be called explicitly at session end; same schema. |
| OpenAI API (no MCP) | No path | Token data not available without a Stop hook equivalent. |

Both paths write to the same `TokenUsageEvent` table. Per-project aggregation, per-card session-expansion, and pricing all behave identically regardless of which path produced the row.

## 03 — Setup walkthrough

The fastest path is the in-app dialog: open any project's Costs page (`/projects/[projectId]/costs`) or the Pulse strip's "Set up token tracking" CTA, copy the snippet (it embeds your machine's absolute path to `scripts/stop-hook.sh`), paste into your Claude Code `settings.json`, and click Re-check. The dialog's three numbered steps are:

1. **The hook** — copy a JSON `{ "hooks": { "Stop": [...] } }` snippet rendered with the absolute path of *this* server's `scripts/stop-hook.sh` already filled in.
2. **Where it goes** — list every `settings.json` Claude Code reads on this machine, marking which ones already contain the hook (`configured`) versus which need the paste (`needs paste`).
3. **Verify** — diagnostics readout: `events recorded`, `last event`, and `projects missing repoPath`. Re-check button re-runs the diagnostics tRPC procedure.

### Manual path (no dialog)

If you'd rather skip the dialog and edit the file by hand:

1. Find your stop-hook script: it's `scripts/stop-hook.sh` inside your local Pigeon clone. The absolute path is what you paste into `command:`.

2. Add the snippet to one of these `settings.json` files (Claude Code reads hooks from `settings.json` only — the `hooks` key in `.claude.json` is silently ignored in CC 2.1.x):
   - `$CLAUDE_CONFIG_DIR/settings.json` (when `CLAUDE_CONFIG_DIR` is set)
   - `~/.claude/settings.json` (default user-level install)
   - `~/.claude-alt/settings.json` (side-by-side alt install)
   - `<repo>/.claude/settings.json` (project-level, shared/committed)
   - `<repo>/.claude/settings.local.json` (project-local, gitignored)

3. The snippet:

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

4. Make sure `scripts/stop-hook.sh` is executable. From your Pigeon clone: `chmod +x scripts/stop-hook.sh`.

5. End a Claude Code session (`/exit` or close the conversation). The hook fires on session exit; the next time you open `/projects/[projectId]/costs` you should see the event count tick up.

### Common silent-drop causes

- **`Project.repoPath` not set.** The Stop hook receives the session's `cwd` and matches it to the project with the longest matching `repoPath` prefix. Projects without `repoPath` can't be matched, so their sessions land in `projectsWithoutRepoPath` (visible in the dialog's diagnostics) and produce no events. Fix via `registerRepo` MCP tool or by editing the project in the web UI.
- **Wrong file.** `.claude.json` is internal Claude Code state — its `hooks` key is ignored. Use `settings.json`.
- **Script not executable.** `chmod +x scripts/stop-hook.sh`.

The hook writes a diagnostic line to `<repo>/data/stop-hook.log` on every fire (whether successful or not), so silent failures are debuggable.

## 04 — Counterfactual methodology

The "Pigeon paid for itself" headline (the `<SavingsSection>` lens, step "01b" on the Costs page) compares two payload sizes:

- **Naive context** = `getBoard` + `getLatestHandoff` response sizes. This is what an agent would have to pull in to reach the same context Pigeon's `briefMe` produces if `briefMe` didn't exist. Measured in tokens via a `chars/4` estimator.
- **briefMe** = the actual `briefMe` MCP response token count for this project. Same `chars/4` estimator on the JSON-serialized payload, so the comparison is apples-to-apples.

`recalibrateBaseline({ projectId })` measures both at the current board state and persists the result on `Project.metadata.tokenBaseline`. The persisted shape is:

```jsonc
{
  "tokenBaseline": {
    "briefMeTokens": 4231,
    "naiveBootstrapTokens": 18402,
    "latestHandoffTokens": 612,   // optional — only present when a handoff exists
    "measuredAt": "2026-04-30T12:34:56.789Z"
  }
}
```

The savings figure is then computed by `getSavingsSummary(projectId, period)`:

```
gross_savings = (naive_tokens - briefme_tokens) × output_rate × briefme_call_count
net_savings   = gross_savings - pigeon_overhead_cost
```

Where:

- `naive_tokens` and `briefme_tokens` come from the persisted baseline (the `naiveBootstrapTokens` and `briefMeTokens` keys above).
- `briefme_call_count` is the count of `ToolCallLog` rows for `toolName = "briefMe"` whose session landed in the period window.
- `output_rate` is the `outputPerMTok` rate of the project's **most recently used model**. Pigeon picks the most-recent session's model rather than `getProjectSummary.byModel[0]`, because `byModel[0]` sorts by historical spend — the wrong rate to price *current* savings against. A project that ran one ancient Opus session and a fresh Sonnet session is priced at the Sonnet rate.
- `pigeon_overhead_cost` is `getPigeonOverhead(projectId, period).totalCostUsd` — the same window, so numerator and denominator can never drift.

**Conservative framing.** We assume one briefMe-equivalent rebuild per session would have been needed in the naive case (i.e. `briefMeCallCount` stands in for "sessions that benefited from Pigeon"). This under-counts savings on multi-resume sessions and intentionally over-attributes overhead — the resulting net is a lower bound. When `net_savings` is negative (overhead exceeds gross savings — typical for low briefMe frequency + high tool-call count workflows), the UI displays the negative number honestly in amber rather than rounding to zero or hiding it. The methodology Sheet's Section 03 explains this case in-app.

## 05 — Pricing override walkthrough

Default rates for Anthropic (Opus 4-7, Opus 4-6, Sonnet 4-6, Haiku 4-5) and OpenAI (GPT-4o, GPT-4o-mini, GPT-4-turbo, o1) ship in `src/lib/token-pricing-defaults.ts`. The `PRICING_LAST_VERIFIED` constant in that file gates an amber banner on the override table; sanity-check the provider's pricing page if it's been a while since the verified date.

To override a rate:

1. Navigate to `/projects/[projectId]/costs` (the Costs button in any board header gets you there).
2. Scroll to step "05 — Pricing" near the bottom of the page.
3. Find the model row. Each row shows all five rate fields (Input, Output, Cache Read, Cache 1h, Cache 5m) with the built-in default as a muted "Default: $X" hint beneath each input.
4. Edit the rate. Overridden cells get a violet underline.
5. Click **Save pricing**. The change persists to `AppSettings.tokenPricing` and applies immediately.

A per-row reset button (rotate-counter-clockwise icon) clears any override for that row and re-runs the mutation immediately — there's no "save" step for a reset.

### Adding an unlisted model

Click **Add model** at the bottom of the table. A new row appears with an editable name field and zero-defaulted rates.

- Model identifiers normalize to **lowercase** before persisting.
- Format must match `^[a-z0-9][a-z0-9-_.]*$` after normalization. Inputs like `gpt 4` (space) or `Anthropic/Claude` (slash) are rejected with an inline error.
- Duplicates are detected case-insensitively against (a) built-in defaults, (b) existing overrides, and (c) other in-progress add-rows. The error message redirects you to edit the existing row instead.

Empty rate fields persist as 0 — useful for providers where a column doesn't apply (e.g. OpenAI cache-creation columns are 0 because OpenAI caching is automatic and free at write time).

### Banner: "Defaults last verified"

The amber banner above the table shows `PRICING_LAST_VERIFIED` from the defaults module. It's a stale-defaults nudge — defaults aren't auto-refreshed, so if the date is months old, cross-check the provider's pricing page and override anything that's drifted. The banner doesn't gate functionality; it's purely informational.

## 06 — Recalibrate baseline walkthrough

Two paths land at the same `tokenUsageService.recalibrateBaseline` call:

- **Web UI.** Open the methodology Sheet via the "How is this calculated?" link in the savings lens (`<SavingsSection>` on the Costs page). The Sheet's Section 04 has a **Recalibrate baseline** button — clicking it fires the `tokenUsage.recalibrateBaseline` tRPC mutation and toasts on success.
- **MCP tool.** Call `recalibrateBaseline({ projectId })` directly. Same code path, useful when scripting or running from another agent.

Both paths overwrite any existing `Project.metadata.tokenBaseline`. The in-app button is the easier path for ad-hoc human use; the MCP tool is the path for an agent to call after a notable change.

### When to re-run

- **After significant briefMe prompt changes.** If the briefMe payload assembly (`buildBriefPayload` in `src/server/services/brief-payload-service.ts`) is modified, the previous baseline measures against an obsolete payload shape. Recalibrate so the savings lens reflects the new reality.
- **After a Pigeon upgrade that changes either side of the comparison.** Updates to `getBoard` shape, handoff serialization, or briefMe composition are all triggers.
- **After significant board growth.** A baseline taken on a 3-card board under-estimates savings on a now-200-card board, since `naiveBootstrapTokens` scales with the full board payload but `briefMeTokens` doesn't scale linearly. If the savings number stops feeling right, recalibrate.

There's no automatic recalibration — the baseline is a snapshot, not a live measurement. That's intentional: a stable baseline means the savings curve over time reflects *usage* changes, not measurement noise.

## 07 — FAQ

### Why is my cost $0 even though I ran a session?

Two common causes:

1. **`Project.repoPath` not set.** The Stop hook can't match the session's `cwd` to a project without it, so the row never lands. The setup dialog's diagnostics surface this as `projects missing repoPath`. Fix via `registerRepo` MCP tool or the project edit form.
2. **Hook not installed (or installed in the wrong file).** `.claude.json`'s `hooks` key is silently ignored by CC 2.1.x. The hook must live in `settings.json`. Re-check via the setup dialog.

### What is Pigeon overhead?

The cost of Pigeon's own MCP tool *responses* — what the agent paid in `outputPerMTok` to read tool results. F1 added a `responseTokens` column on `ToolCallLog` (the `chars/4` estimator on the result body); the U2 lens turns those bytes into a dollar number, grouped per tool. Anthropic bills the assistant turn that emits a tool result against `outputPerMTok`, so we use that same rate on both sides of the savings math.

### My savings are negative — bug?

No. Low briefMe frequency + high tool call count → overhead exceeds savings, so net is negative. The lens shows it honestly in amber rather than hiding it. The methodology Sheet's Section 03 ("Conservative framing") explains this case in-app, and the headline copy reads "Pigeon cost $X.XX more than it saved this period." Increasing briefMe call frequency or reducing unnecessary tool calls reverses the sign.

### Which pricing rates does Pigeon use?

`DEFAULT_PRICING` from `src/lib/token-pricing-defaults.ts` plus any user overrides persisted to `AppSettings.tokenPricing`. Overrides merge on top of defaults — a partial override only changes the fields you edited. Models with no entry on either side fall through to `__default__` (zeroes), which produces a clean $0 cost rather than a wrong guess; the override table flags these as "Unknown model" amber rows so you can add pricing.

### Can I track OpenAI sessions?

Yes via the manual path — call the `recordTokenUsage` MCP tool at session end with the `model`, `inputTokens`, and `outputTokens` you have from your provider:

```
recordTokenUsage({
  projectId,         // or boardId
  model: "gpt-4o",
  inputTokens: 12345,
  outputTokens: 6789
})
```

No via an automatic hook — the OpenAI API doesn't have a Stop-hook equivalent, and Pigeon doesn't proxy your model calls. Each `recordTokenUsage` call creates one new row, so sum your counts before invoking; don't loop.

### Does Pigeon read my transcripts?

No. The Stop hook script extracts only `message.usage` fields (input/output/cache token counts) and `message.model` from the JSONL transcript, plus the same fields from any sibling sub-agent transcripts at `<dirname>/<sessionId>/subagents/agent-*.jsonl`. Message content, tool inputs, and tool outputs are not read or persisted. The hook writes one `TokenUsageEvent` row per (sessionId, model) tuple — that's the entire on-disk artifact.

### What is `attributeSession`?

An MCP tool that bulk-attributes every `TokenUsageEvent` for a session to a specific card. The Stop hook records rows with `cardId = null` (it doesn't know which card a session was about), which leaves card-level cost surfaces at $0. `attributeSession` closes that gap. It's auto-called fire-and-forget from `briefMe` when an active card is known, and from `saveHandoff` when exactly one card was touched. Idempotent + last-write-wins; safe to call multiple times. This is what powers U4's cost-per-shipped-card lens.

### How often should I recalibrate?

After significant briefMe usage pattern change or Pigeon upgrade — see Section 06 for the full list of triggers. There's no time-based recommendation; if the savings number stops feeling right relative to your workflow, recalibrate. Otherwise, leave the baseline alone — a stable baseline means the savings curve reflects usage changes, not measurement noise.

### Why does the Costs page show "Cards with no attributed token events are excluded"?

The cost-per-shipped-card lens (`<CardDeliverySection>`) only counts shipped cards that have at least one attributed `TokenUsageEvent`. Cards with $0 attributed cost are kept in the `shippedCount` headline but dropped from the avg/total math so they don't dilute the average. This handles the case where a card was completed without AI involvement (or before tracking was wired up) without misrepresenting either bucket.

## See also

- `AGENTS.md` §Token Tracking — minimal "wire the hook" path.
- `src/server/services/token-usage-service.ts` — the canonical implementation. Every formula in this doc is grounded in a function in that file.
- `src/lib/token-pricing-defaults.ts` — `DEFAULT_PRICING` + `PRICING_LAST_VERIFIED`.
- `src/lib/token-tracking-docs.ts` — shared docs target for in-app CTAs.
