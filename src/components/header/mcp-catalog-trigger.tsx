"use client";

import { Boxes } from "lucide-react";
import { useEffect, useState } from "react";
import { McpCatalogPopover } from "@/components/header/mcp-catalog-popover";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Header pill that opens the MCP tool catalog. The dashed-border style
// echoes TagCombobox's "Add tag" pill — same visual family, different
// intent. The `?` kbd hint teaches the keyboard shortcut without the
// shortcut hiding behind a tooltip.
export function McpCatalogTrigger() {
	const [open, setOpen] = useState(false);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Only fire when no other input has focus — `?` is a single
			// printable key that would otherwise type into form fields.
			if (e.key !== "?") return;
			const target = e.target as HTMLElement | null;
			if (
				target &&
				(target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
			) {
				return;
			}
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			// Don't toggle close from `?` — once the catalog is open, focus
			// can land on a CommandItem (a div, not an input), and `?` would
			// otherwise dismiss the catalog mid-navigation. Esc and click-
			// outside (handled by Radix) are the only close affordances.
			setOpen((prev) => {
				if (prev) return prev;
				e.preventDefault();
				return true;
			});
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label="Browse MCP tools"
					aria-expanded={open}
					aria-controls="mcp-catalog"
					className="hidden items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent hover:text-foreground sm:flex"
				>
					<Boxes className="h-3.5 w-3.5" />
					MCP
					<kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">?</kbd>
				</button>
			</PopoverTrigger>
			<PopoverContent
				id="mcp-catalog"
				align="end"
				sideOffset={8}
				className="w-auto p-0"
				role="dialog"
				aria-label="MCP tool catalog"
			>
				<McpCatalogPopover enabled={open} />
			</PopoverContent>
		</Popover>
	);
}
