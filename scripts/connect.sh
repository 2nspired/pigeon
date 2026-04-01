#!/usr/bin/env bash
#
# Connect a project to the Project Tracker MCP server.
#
# Usage:
#   From any project directory:
#     /path/to/project-tracker/scripts/connect.sh
#
#   Or with an explicit target:
#     /path/to/project-tracker/scripts/connect.sh /path/to/my-project
#

set -euo pipefail

# Resolve the project-tracker root (parent of scripts/)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TRACKER_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Target directory is the argument, or current working directory
TARGET_DIR="${1:-$(pwd)}"
TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"

MCP_FILE="$TARGET_DIR/.mcp.json"

# Sanity check: don't connect project-tracker to itself
if [ "$TARGET_DIR" = "$TRACKER_ROOT" ]; then
  echo "Error: You're inside project-tracker itself. Run this from a different project."
  exit 1
fi

# Check if .mcp.json already exists
if [ -f "$MCP_FILE" ]; then
  # Check if project-tracker is already configured
  if grep -q "project-tracker" "$MCP_FILE" 2>/dev/null; then
    echo "project-tracker is already configured in $MCP_FILE"
    exit 0
  fi

  echo "Warning: $MCP_FILE already exists with other MCP servers."
  echo "You'll need to manually add the project-tracker entry."
  echo ""
  echo "Add this to the \"mcpServers\" object in $MCP_FILE:"
  echo ""
  echo "  \"project-tracker\": {"
  echo "    \"command\": \"npx\","
  echo "    \"args\": [\"tsx\", \"src/mcp/server.ts\"],"
  echo "    \"cwd\": \"$TRACKER_ROOT\""
  echo "  }"
  exit 0
fi

# Create .mcp.json
cat > "$MCP_FILE" <<EOF
{
  "mcpServers": {
    "project-tracker": {
      "command": "npx",
      "args": ["tsx", "src/mcp/server.ts"],
      "cwd": "$TRACKER_ROOT"
    }
  }
}
EOF

echo "Created $MCP_FILE"
echo "Project Tracker MCP is now available in this project."
echo ""
echo "Tip: Add this to your project's CLAUDE.md:"
echo ""
echo "  ## Project Tracking"
echo "  This project is tracked in the Project Tracker board."
echo "  Use the \`project-tracker\` MCP tools to read and update the board."
echo "  Reference cards by #number in conversation (e.g. \"working on #7\")."
