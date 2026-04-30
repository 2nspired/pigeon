// Shared docs target for the token-tracking setup CTAs (Pulse strip,
// card-detail empty state, and the new in-app setup dialog's "Read more"
// footer). Single source so all three surfaces stay in sync if AGENTS.md
// anchors are renamed.

export const TOKEN_TRACKING_DOCS_URL =
	"https://github.com/2nspired/pigeon/blob/main/AGENTS.md#token-tracking-96";

// The Stop hook config users paste into their Claude Code config. Kept as a
// pretty-printed JSON string (rather than an object stringified at runtime)
// so the rendered snippet matches AGENTS.md byte-for-byte and the Copy
// button produces the exact text users see.
export const TOKEN_TRACKING_HOOK_SNIPPET = `{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "mcp_tool",
            "server": "pigeon",
            "tool": "recordTokenUsageFromTranscript",
            "input": {
              "transcriptPath": "\${transcript_path}",
              "sessionId": "\${session_id}",
              "cwd": "\${cwd}"
            }
          }
        ]
      }
    ]
  }
}`;
