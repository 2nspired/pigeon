import { describe, expect, it } from "vitest";
import { ESSENTIAL_TOOLS } from "../manifest";
import { WORKFLOWS } from "../workflows";

describe("essential tool rename: endSession → saveHandoff (#151)", () => {
	it("manifest lists `saveHandoff` as an essential tool", () => {
		const names = ESSENTIAL_TOOLS.map((t) => t.name);
		expect(names).toContain("saveHandoff");
	});

	it("manifest no longer lists `endSession` as a top-level essential", () => {
		const names = ESSENTIAL_TOOLS.map((t) => t.name);
		expect(names).not.toContain("endSession");
	});

	it("essential count is still 10", () => {
		expect(ESSENTIAL_TOOLS).toHaveLength(10);
	});

	it("sessionEnd workflow points at `saveHandoff`, not `endSession`", () => {
		const sessionEnd = WORKFLOWS.find((w) => w.name === "sessionEnd");
		expect(sessionEnd).toBeDefined();
		const tools = sessionEnd?.steps.map((s) => s.tool) ?? [];
		expect(tools).toContain("saveHandoff");
		expect(tools).not.toContain("endSession");
	});
});
