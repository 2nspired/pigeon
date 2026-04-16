import { z } from "zod";
import {
	setScratch,
	getScratch,
	listScratch,
	clearScratch,
	gcExpiredScratch,
} from "../../lib/services/scratch.js";
import { db } from "../db.js";
import { registerExtendedTool } from "../tool-registry.js";
import { AGENT_NAME, ok, err, safeExecute } from "../utils.js";

// ─── Scratch (Ephemeral Agent Working Memory) ─────────────────────

registerExtendedTool("scratch", {
	category: "scratch",
	description:
		"Ephemeral key-value scratchpad (auto-expires). action=set: store a value, action=get: read by key, action=list: all entries, action=clear: delete one or all entries.",
	parameters: z.object({
		action: z.enum(["set", "get", "list", "clear"]).describe("Operation to perform"),
		boardId: z.string().describe("Board UUID"),
		key: z.string().optional().describe("Key name (required for set/get, optional for clear — omit to clear all)"),
		value: z.string().optional().describe("Value to store (required for set)"),
		ttlDays: z.number().int().min(1).max(90).default(7).describe("Days until expiry (set only, default 7)"),
	}),
	handler: ({ action, boardId, key, value, ttlDays }) =>
		safeExecute(async () => {
			const bid = boardId as string;

			if (action === "set") {
				if (!key) return err("key is required for action=set.");
				if (value === undefined) return err("value is required for action=set.");
				const entry = await setScratch(db, {
					boardId: bid,
					agentName: AGENT_NAME,
					key: key as string,
					value: value as string,
					ttlDays: ttlDays as number,
				});
				return ok({
					key: entry.key,
					value: entry.value,
					agentName: entry.agentName,
					expiresAt: entry.expiresAt,
					updatedAt: entry.updatedAt,
				});
			}

			if (action === "get") {
				if (!key) return err("key is required for action=get.");
				await gcExpiredScratch(db);
				const entry = await getScratch(db, bid, AGENT_NAME, key as string);
				if (!entry) return ok({ key, value: null, found: false });
				return ok({
					key: entry.key,
					value: entry.value,
					agentName: entry.agentName,
					expiresAt: entry.expiresAt,
					updatedAt: entry.updatedAt,
					found: true,
				});
			}

			if (action === "list") {
				const entries = await listScratch(db, bid, AGENT_NAME);
				return ok({ agentName: AGENT_NAME, count: entries.length, entries });
			}

			if (action === "clear") {
				const result = await clearScratch(db, bid, AGENT_NAME, key as string | undefined);
				return ok(key ? { cleared: result.count, key } : { cleared: result.count, agentName: AGENT_NAME, scope: "all" });
			}

			return err(`Unknown action: ${action as string}`);
		}),
});
