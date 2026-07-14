# @2nspired/pigeon

The bootstrap CLI for [Pigeon](https://github.com/2nspired/pigeon) — a local-first kanban board + MCP server that gives AI coding agents durable context across sessions.

```bash
npx @2nspired/pigeon init
```

One command, run from inside your project repo. It:

1. Clones the latest Pigeon release into `~/.pigeon` (override with `PIGEON_HOME` or `--home`) and installs its dependencies.
2. Creates/migrates the SQLite database.
3. Registers the Pigeon MCP server with Claude Code (user scope via `claude mcp add`; falls back to a project-scoped `.mcp.json`).
4. Registers your repo with Pigeon so `briefMe()` auto-detects it, writes a starter `tracker.md`, and installs the `/brief-me`, `/handoff`, and `/plan-card` slash commands plus the token-tracking Stop hook.
5. On macOS, installs the always-on background service at `http://localhost:3100`.

Re-running is safe — every step is idempotent.

## Flags

| Flag | Meaning |
| --- | --- |
| `--ref <branch\|tag>` | Check out a specific ref instead of the latest release tag |
| `--home <dir>` | Pigeon home checkout location (same as `PIGEON_HOME`) |
| `--agent-name <name>` | Agent display name on the board (default `Claude`) |
| `--no-claude` | Skip `claude mcp add`; write a project-scoped `.mcp.json` instead |
| `--no-service` | Skip the macOS launchd service install |
| `--no-register` | Skip registering the current repo with Pigeon |

This package is only the installer — the app itself runs from the git checkout it creates. Full docs: <https://2nspired.github.io/pigeon/>.
