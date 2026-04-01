#!/usr/bin/env bash
# Launcher for the Project Tracker MCP server.
# Ensures correct working directory regardless of where it's invoked from.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TRACKER_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$TRACKER_ROOT"
exec node_modules/.bin/tsx src/mcp/server.ts
