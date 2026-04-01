// Tests the cn() utility — demonstrates basic test structure:
// - describe() groups related tests
// - it() defines a single test case
// - expect() asserts the result
import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn utility", () => {
	it("merges class names", () => {
		expect(cn("px-2", "py-1")).toBe("px-2 py-1");
	});

	it("handles conditional classes", () => {
		expect(cn("base", false && "hidden", "visible")).toBe("base visible");
	});

	it("resolves tailwind conflicts (last wins)", () => {
		expect(cn("px-2", "px-4")).toBe("px-4");
	});
});
