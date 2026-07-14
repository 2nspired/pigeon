/**
 * Locked plan-section detection — shared by the MCP `planCard` tool
 * (refuse-on-exists guard) and the briefMe payload builder (no-plan hint,
 * #317). Lives in `src/lib/` because `src/server/` and `src/mcp/` never
 * import each other; both consume this module.
 */

const REQUIRED_PLAN_HEADERS: ReadonlyArray<RegExp> = [
	/^##\s+Why now\s*$/im,
	/^##\s+Plan\s*$/im,
	/^##\s+Acceptance\s*$/im,
];

/**
 * Heuristic: does the card description already contain the locked-section
 * headers (Why now / Plan / Acceptance)? Out-of-scope is encouraged but
 * optional — sometimes there's nothing to defer. Case-insensitive on the
 * heading text; requires a level-2 ATX heading on its own line.
 */
export function hasLockedPlanSections(description: string | null | undefined): boolean {
	if (!description) return false;
	return REQUIRED_PLAN_HEADERS.every((re) => re.test(description));
}
