"use client";

import { FolderKanban, Hash, LayoutDashboard, Plus, StickyNote } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@/components/ui/command";
import { PRIORITY_DOT } from "@/lib/priority-colors";
import type { Priority } from "@/lib/schemas/card-schemas";
import { api } from "@/trpc/react";

export function CommandPalette() {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const router = useRouter();

	// Debounce search input
	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedSearch(search);
		}, 300);
		return () => clearTimeout(timer);
	}, [search]);

	// Listen for Cmd+K / Ctrl+K
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				setOpen((prev) => !prev);
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);

	// Reset search when closing
	const handleOpenChange = useCallback((value: boolean) => {
		setOpen(value);
		if (!value) {
			setSearch("");
			setDebouncedSearch("");
		}
	}, []);

	// Search cards only when palette is open and there's a search term
	const { data: cards, isLoading: cardsLoading } = api.card.listAll.useQuery(
		{ search: debouncedSearch },
		{
			enabled: open && debouncedSearch.length > 0,
		}
	);

	const runCommand = useCallback(
		(command: () => void) => {
			handleOpenChange(false);
			command();
		},
		[handleOpenChange]
	);

	return (
		<CommandDialog
			open={open}
			onOpenChange={handleOpenChange}
			title="Command Palette"
			description="Search cards, navigate, or run actions"
			showCloseButton={false}
		>
			<CommandInput
				placeholder="Search cards, pages, actions..."
				value={search}
				onValueChange={setSearch}
			/>
			<CommandList>
				<CommandEmpty>{cardsLoading ? "Searching..." : "No results found."}</CommandEmpty>

				{/* Card search results */}
				{debouncedSearch.length > 0 && cards && cards.length > 0 && (
					<CommandGroup heading="Cards">
						{cards.map((card) => (
							<CommandItem
								key={card.id}
								value={`card-${card.number}-${card.title}`}
								onSelect={() =>
									runCommand(() => {
										const url = `/projects/${card.column.board.project.id}/boards/${card.column.board.id}`;
										router.push(url as Parameters<typeof router.push>[0]);
									})
								}
							>
								<Hash className="size-4 text-muted-foreground" />
								<span className="flex-1 truncate">
									<span className="text-muted-foreground">#{card.number}</span> {card.title}
								</span>
								<span className="flex items-center gap-2">
									<span
										className={`size-2 rounded-full ${PRIORITY_DOT[card.priority as Priority] ?? PRIORITY_DOT.NONE}`}
									/>
									<span className="max-w-[120px] truncate text-xs text-muted-foreground">
										{card.column.name}
									</span>
								</span>
							</CommandItem>
						))}
					</CommandGroup>
				)}

				{/* Navigation */}
				<CommandGroup heading="Navigation">
					<CommandItem value="projects" onSelect={() => runCommand(() => router.push("/projects"))}>
						<FolderKanban className="size-4" />
						Projects
					</CommandItem>
					<CommandItem
						value="dashboard"
						onSelect={() => runCommand(() => router.push("/dashboard"))}
					>
						<LayoutDashboard className="size-4" />
						Dashboard
					</CommandItem>
					<CommandItem value="notes" onSelect={() => runCommand(() => router.push("/notes"))}>
						<StickyNote className="size-4" />
						Notes
					</CommandItem>
				</CommandGroup>

				<CommandSeparator />

				{/* Actions */}
				<CommandGroup heading="Actions">
					<CommandItem
						value="create new project"
						onSelect={() => runCommand(() => router.push("/projects"))}
					>
						<Plus className="size-4" />
						Create new project
					</CommandItem>
				</CommandGroup>
			</CommandList>
		</CommandDialog>
	);
}
