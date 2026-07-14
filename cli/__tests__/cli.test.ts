// @vitest-environment node
/**
 * Tests for the `pigeon` CLI's pure logic (#314 Phase B): arg parsing,
 * release-tag selection, idempotency decisions (.mcp.json / Stop hook /
 * slash commands / home checkout), template generation, and the
 * `claude mcp add` command construction.
 *
 * File-writing helpers run against real temp dirs (same approach as
 * scripts/__tests__/db-migrate.test.ts); nothing here spawns a child
 * process or touches the network.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseCliArgs } from "../lib/args.mjs";
import { installSlashCommands, planCommandInstall } from "../lib/commands.mjs";
import {
	applyHomeMigrations,
	compareReleaseTags,
	inspectHome,
	LAST_UNSUPPORTED_RELEASE,
	latestReleaseTag,
	parseReleaseTags,
	planHomeCheckout,
	resolvePigeonHome,
	unsupportedCheckoutMessage,
} from "../lib/home.mjs";
import {
	buildClaudeMcpAddArgs,
	buildClaudeMcpGetArgs,
	pigeonServerEntry,
	planMcpJsonUpdate,
	writeProjectMcpJson,
} from "../lib/mcp-config.mjs";
import {
	hasPigeonStopHook,
	installStopHook,
	mergeStopHook,
	resolveUserSettingsPath,
} from "../lib/stop-hook.mjs";
import { slugify, starterTrackerMd, writeStarterTrackerMd } from "../lib/tracker-template.mjs";

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "pigeon-cli-test-"));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

// ─── parseCliArgs ──────────────────────────────────────────────────

describe("parseCliArgs", () => {
	it("parses a bare init with zero-question defaults", () => {
		const args = parseCliArgs(["init"]);
		expect(args.command).toBe("init");
		expect(args.errors).toEqual([]);
		expect(args).toMatchObject({
			ref: null,
			home: null,
			agentName: "Claude",
			claude: true,
			service: true,
			register: true,
			help: false,
		});
	});

	it("parses every flag", () => {
		const args = parseCliArgs([
			"init",
			"--ref",
			"main",
			"--home",
			"/tmp/pigeon-home",
			"--agent-name",
			"Fable",
			"--no-claude",
			"--no-service",
			"--no-register",
			"--yes",
		]);
		expect(args.errors).toEqual([]);
		expect(args).toMatchObject({
			command: "init",
			ref: "main",
			home: "/tmp/pigeon-home",
			agentName: "Fable",
			claude: false,
			service: false,
			register: false,
		});
	});

	it("takes a positional target for connect only", () => {
		expect(parseCliArgs(["connect", "/tmp/proj"]).target).toBe("/tmp/proj");
		const init = parseCliArgs(["init", "/tmp/proj"]);
		expect(init.errors).toEqual(["Unexpected argument: /tmp/proj"]);
	});

	it("collects errors instead of throwing", () => {
		const args = parseCliArgs(["frobnicate", "--wat", "--ref"]);
		expect(args.errors).toEqual([
			"Unknown command: frobnicate",
			"Unknown option: --wat",
			"--ref requires a value",
		]);
	});

	it("rejects agent names that would break the JSON we write", () => {
		const args = parseCliArgs(["init", "--agent-name", 'Cla"ude']);
		expect(args.errors).toHaveLength(1);
		expect(args.errors[0]).toMatch(/agent-name/);
	});
});

// ─── Release tags ──────────────────────────────────────────────────

describe("release tags", () => {
	const LS_REMOTE = [
		"aaa\trefs/tags/v5.0.0",
		"bbb\trefs/tags/v6.6.0",
		"ccc\trefs/tags/v6.6.0^{}",
		"ddd\trefs/tags/v6.10.2",
		"eee\trefs/tags/v7.0.0-rc.1",
		"fff\trefs/tags/some-other-tag",
		"",
	].join("\n");

	it("parses vX.Y.Z tags, folding peeled refs and skipping pre-releases", () => {
		expect(parseReleaseTags(LS_REMOTE).sort()).toEqual(["v5.0.0", "v6.10.2", "v6.6.0"]);
	});

	it("compares numerically, not lexicographically", () => {
		expect(compareReleaseTags("v6.10.2", "v6.6.0")).toBeGreaterThan(0);
		expect(compareReleaseTags("v6.6.0", "v6.6.0")).toBe(0);
	});

	it("picks the highest release", () => {
		expect(latestReleaseTag(parseReleaseTags(LS_REMOTE))).toBe("v6.10.2");
		expect(latestReleaseTag([])).toBeNull();
	});
});

// ─── Home checkout decisions ───────────────────────────────────────

describe("planHomeCheckout", () => {
	it("clones into a missing or empty dir", () => {
		expect(
			planHomeCheckout({ exists: false, empty: false, hasGitDir: false, packageName: null }),
		).toBe("clone");
		expect(
			planHomeCheckout({ exists: true, empty: true, hasGitDir: false, packageName: null }),
		).toBe("clone");
	});

	it("reuses an existing Pigeon checkout (either package name era)", () => {
		for (const packageName of ["pigeon-mcp", "project-tracker"]) {
			expect(planHomeCheckout({ exists: true, empty: false, hasGitDir: true, packageName })).toBe(
				"reuse",
			);
		}
	});

	it("refuses to touch a non-Pigeon dir", () => {
		expect(
			planHomeCheckout({ exists: true, empty: false, hasGitDir: true, packageName: "next" }),
		).toBe("conflict");
		expect(
			planHomeCheckout({ exists: true, empty: false, hasGitDir: false, packageName: null }),
		).toBe("conflict");
	});

	it("inspectHome classifies real directories", () => {
		expect(inspectHome(join(dir, "missing"))).toBe("clone");

		const pigeon = join(dir, "pigeon");
		mkdirSync(join(pigeon, ".git"), { recursive: true });
		writeFileSync(join(pigeon, "package.json"), JSON.stringify({ name: "pigeon-mcp" }));
		expect(inspectHome(pigeon)).toBe("reuse");

		const other = join(dir, "other");
		mkdirSync(other, { recursive: true });
		writeFileSync(join(other, "hello.txt"), "hi");
		expect(inspectHome(other)).toBe("conflict");
	});
});

describe("release-tag constraint (pre-Phase-A checkouts)", () => {
	it("applyHomeMigrations fails clearly when the checkout lacks the helper", () => {
		// A clone of the newest release today (v6.6.0) has no scripts/db-migrate.ts.
		expect(() => applyHomeMigrations({ home: dir, ref: "v6.6.0" })).toThrow(
			unsupportedCheckoutMessage(dir, "v6.6.0"),
		);
	});

	it("names the minimum release and the --ref main escape hatch", () => {
		const message = unsupportedCheckoutMessage("/Users/x/.pigeon", "v6.6.0");
		expect(message).toContain(LAST_UNSUPPORTED_RELEASE);
		expect(message).toContain("scripts/db-migrate.ts");
		expect(message).toContain("--ref main");
	});
});

describe("resolvePigeonHome", () => {
	it("prefers the flag, then PIGEON_HOME, then ~/.pigeon", () => {
		expect(resolvePigeonHome({ PIGEON_HOME: "/env/home" }, "/flag/home")).toBe("/flag/home");
		expect(resolvePigeonHome({ PIGEON_HOME: "/env/home" }, null)).toBe("/env/home");
		expect(resolvePigeonHome({}, null).endsWith("/.pigeon")).toBe(true);
	});
});

// ─── MCP registration ──────────────────────────────────────────────

describe("claude mcp command construction", () => {
	it("registers user-scoped via the claude CLI — never hand-edits ~/.claude.json (#154)", () => {
		expect(buildClaudeMcpAddArgs("/Users/x/.pigeon", "Fable")).toEqual([
			"mcp",
			"add",
			"--scope",
			"user",
			"--env",
			"AGENT_NAME=Fable",
			"pigeon",
			"--",
			"/Users/x/.pigeon/scripts/pigeon-start.sh",
		]);
	});

	it("probes for an existing registration with mcp get", () => {
		expect(buildClaudeMcpGetArgs()).toEqual(["mcp", "get", "pigeon"]);
	});
});

describe("planMcpJsonUpdate", () => {
	const entry = pigeonServerEntry("/home/pigeon", "Claude");

	it("creates a fresh .mcp.json when none exists", () => {
		const plan = planMcpJsonUpdate(null, entry);
		expect(plan.status).toBe("create");
		expect(plan.json).toEqual({ mcpServers: { pigeon: entry } });
	});

	it("merges into an existing file, preserving other servers and keys", () => {
		const raw = JSON.stringify({ mcpServers: { other: { command: "x" } }, custom: true });
		const plan = planMcpJsonUpdate(raw, entry);
		expect(plan.status).toBe("add");
		expect(plan.json).toEqual({
			custom: true,
			mcpServers: { other: { command: "x" }, pigeon: entry },
		});
	});

	it("is a no-op when pigeon (or the legacy key) is already configured", () => {
		expect(planMcpJsonUpdate(JSON.stringify({ mcpServers: { pigeon: {} } }), entry).status).toBe(
			"already-configured",
		);
		expect(
			planMcpJsonUpdate(JSON.stringify({ mcpServers: { "project-tracker": {} } }), entry).status,
		).toBe("already-configured");
	});

	it("flags unparseable or non-object files instead of clobbering them", () => {
		expect(planMcpJsonUpdate("{nope", entry).status).toBe("unparseable");
		expect(planMcpJsonUpdate('["array"]', entry).status).toBe("unparseable");
	});
});

describe("writeProjectMcpJson", () => {
	it("create → already-configured across two runs (idempotent)", () => {
		expect(writeProjectMcpJson({ targetDir: dir, home: "/home/pigeon" })).toBe("created");
		const written = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8"));
		expect(written.mcpServers.pigeon.command).toBe("/home/pigeon/scripts/pigeon-start.sh");
		expect(written.mcpServers.pigeon.env).toEqual({ AGENT_NAME: "Claude" });

		expect(writeProjectMcpJson({ targetDir: dir, home: "/home/pigeon" })).toBe(
			"already-configured",
		);
	});
});

// ─── Stop hook ─────────────────────────────────────────────────────

describe("stop hook", () => {
	const HOOK = "/home/pigeon/scripts/stop-hook.sh";

	it("recognizes an existing Pigeon hook by suffix, wherever it was installed from", () => {
		const settings = {
			hooks: { Stop: [{ hooks: [{ type: "command", command: "/elsewhere/scripts/stop-hook.sh" }] }] },
		};
		expect(hasPigeonStopHook(settings)).toBe(true);
		expect(mergeStopHook(settings, HOOK).changed).toBe(false);
	});

	it("merges while preserving unrelated keys and hook groups", () => {
		const settings = {
			theme: "dark",
			hooks: { Stop: [{ hooks: [{ type: "command", command: "/other/hook.sh" }] }], PreToolUse: [] },
		};
		const { changed, settings: merged } = mergeStopHook(settings, HOOK);
		expect(changed).toBe(true);
		expect(merged.theme).toBe("dark");
		expect((merged.hooks as { PreToolUse: unknown[] }).PreToolUse).toEqual([]);
		const stop = (merged.hooks as { Stop: unknown[] }).Stop;
		expect(stop).toHaveLength(2);
		expect(stop[1]).toEqual({ hooks: [{ type: "command", command: HOOK }] });
	});

	it("installStopHook: installed → already-installed, and refuses non-object files", () => {
		const settingsPath = join(dir, "settings.json");
		expect(installStopHook({ settingsPath, hookCommand: HOOK }).status).toBe("installed");
		expect(installStopHook({ settingsPath, hookCommand: HOOK }).status).toBe("already-installed");
		expect(hasPigeonStopHook(JSON.parse(readFileSync(settingsPath, "utf8")))).toBe(true);

		writeFileSync(settingsPath, "[]");
		expect(installStopHook({ settingsPath, hookCommand: HOOK }).status).toBe("error");
		expect(readFileSync(settingsPath, "utf8")).toBe("[]");
	});

	it("resolveUserSettingsPath: PIGEON_USER_SETTINGS > CLAUDE_CONFIG_DIR > ~/.claude", () => {
		expect(
			resolveUserSettingsPath({ PIGEON_USER_SETTINGS: "/x/s.json", CLAUDE_CONFIG_DIR: "/y" }, dir),
		).toBe("/x/s.json");
		expect(resolveUserSettingsPath({ CLAUDE_CONFIG_DIR: "/y" }, dir)).toBe(
			resolve("/y", "settings.json"),
		);
		expect(resolveUserSettingsPath({}, dir)).toBe(join(dir, ".claude", "settings.json"));
		// ~/.claude-alt wins over ~/.claude when it exists (mirrors doctor's config-paths).
		mkdirSync(join(dir, ".claude-alt"));
		expect(resolveUserSettingsPath({}, dir)).toBe(join(dir, ".claude-alt", "settings.json"));
	});
});

// ─── Slash commands ────────────────────────────────────────────────

describe("slash commands", () => {
	it("planCommandInstall copies only missing .md files", () => {
		expect(
			planCommandInstall(["brief-me.md", "handoff.md", "plan-card.md", "notes.txt"], ["handoff.md"]),
		).toEqual({
			install: ["brief-me.md", "plan-card.md"],
			skip: ["handoff.md"],
		});
	});

	it("installs as-is and never overwrites local edits", () => {
		const home = join(dir, "home");
		const target = join(dir, "proj");
		mkdirSync(join(home, ".claude", "commands"), { recursive: true });
		mkdirSync(join(target, ".claude", "commands"), { recursive: true });
		writeFileSync(join(home, ".claude", "commands", "brief-me.md"), "shipped brief-me");
		writeFileSync(join(home, ".claude", "commands", "handoff.md"), "shipped handoff");
		writeFileSync(join(target, ".claude", "commands", "handoff.md"), "local edit");

		const first = installSlashCommands({ home, targetDir: target });
		expect(first).toEqual({ installed: ["brief-me.md"], skipped: ["handoff.md"] });
		expect(readFileSync(join(target, ".claude", "commands", "brief-me.md"), "utf8")).toBe(
			"shipped brief-me",
		);
		expect(readFileSync(join(target, ".claude", "commands", "handoff.md"), "utf8")).toBe(
			"local edit",
		);

		const second = installSlashCommands({ home, targetDir: target });
		expect(second.installed).toEqual([]);
		expect(second.skipped.sort()).toEqual(["brief-me.md", "handoff.md"]);
	});
});

// ─── tracker.md template ───────────────────────────────────────────

describe("tracker.md template", () => {
	// Same front-matter shape loadTrackerPolicy expects
	// (src/lib/services/tracker-policy.ts).
	const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

	it("slugify matches register-repo's shape", () => {
		expect(slugify("My App!  v2")).toBe("my-app-v2");
		expect(slugify("--Pigeon--")).toBe("pigeon");
	});

	it("generates schema_version 1 front matter with the project slug", () => {
		const md = starterTrackerMd("My App");
		const match = FRONT_MATTER_RE.exec(md);
		expect(match).not.toBeNull();
		expect(match?.[1]).toContain("schema_version: 1");
		expect(match?.[1]).toContain("project_slug: my-app");
		// Optional policy keys ship commented out, ready to switch on.
		expect(match?.[1]).toContain("# intent_required_on:");
		expect(match?.[2]).toContain("My App");
	});

	it("writeStarterTrackerMd creates once, then leaves the file alone", () => {
		expect(writeStarterTrackerMd({ targetDir: dir, projectName: "proj" })).toBe("created");
		writeFileSync(join(dir, "tracker.md"), "human-edited");
		expect(writeStarterTrackerMd({ targetDir: dir, projectName: "proj" })).toBe("exists");
		expect(readFileSync(join(dir, "tracker.md"), "utf8")).toBe("human-edited");
	});
});
