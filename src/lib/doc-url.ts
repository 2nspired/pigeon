// Single-source helper for the MCP docs URL convention. Until tools.mdx
// has anchors for every tool name, the link still resolves — the page
// just won't jump to the right section. scripts/sync-tool-docs.ts is the
// safety net that keeps docs and registry in lockstep.
const DEFAULT_DOCS_BASE = "https://2nspired.github.io/pigeon";

export function docUrl(toolName: string): string {
	const base = process.env.NEXT_PUBLIC_DOCS_BASE ?? DEFAULT_DOCS_BASE;
	return `${base}/tools/#${toolName}`;
}
