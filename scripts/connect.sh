#!/usr/bin/env bash
#
# Connect a project to the Pigeon MCP server.
#
# Thin shim over the `pigeon` CLI (cli/bin/pigeon.mjs) — the single
# implementation of .mcp.json writing, slash-command install, Stop-hook
# install, and repo registration (#314 Phase B). This checkout acts as the
# Pigeon home, so no ~/.pigeon install is required.
#
# Usage:
#   From any project directory:
#     /path/to/pigeon/scripts/connect.sh
#
#   Or with an explicit target:
#     /path/to/pigeon/scripts/connect.sh /path/to/my-project
#
# Flags pass through to `pigeon connect` (see --help). The project name
# defaults to the repo directory name — no prompts.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TRACKER_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Back-compat: the pre-CLI connect.sh honored the AGENT_NAME env var.
if [ -n "${AGENT_NAME:-}" ]; then
  exec node "$TRACKER_ROOT/cli/bin/pigeon.mjs" connect --home "$TRACKER_ROOT" --agent-name "$AGENT_NAME" "$@"
fi
exec node "$TRACKER_ROOT/cli/bin/pigeon.mjs" connect --home "$TRACKER_ROOT" "$@"
