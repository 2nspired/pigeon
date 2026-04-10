"use client";

import {
	BookOpen,
	Bot,
	CheckSquare,
	ExternalLink,
	Loader2,
	Rocket,
	Search,
	User,
	X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { Priority } from "@/lib/schemas/card-schemas";
import { api } from "@/trpc/react";

const priorityColors: Record<string, string> = {
	NONE: "",
	LOW: "text-blue-500",
	MEDIUM: "text-yellow-500",
	HIGH: "text-orange-500",
	URGENT: "text-red-500",
};

const priorityDots: Record<string, string> = {
	NONE: "bg-muted-foreground/30",
	LOW: "bg-blue-400",
	MEDIUM: "bg-yellow-400",
	HIGH: "bg-orange-400",
	URGENT: "bg-red-500",
};

export default function DashboardPage() {
	const [search, setSearch] = useState("");
	const [priority, setPriority] = useState("ALL");
	const [assignee, setAssignee] = useState("ALL");

	const utils = api.useUtils();

	const seedTutorial = api.project.seedTutorial.useMutation({
		onSuccess: () => {
			utils.project.list.invalidate();
			utils.card.listAll.invalidate();
		},
	});

	const { data: cards, isLoading } = api.card.listAll.useQuery({
		search: search || undefined,
		priority: priority !== "ALL" ? priority : undefined,
		assignee: assignee !== "ALL" ? assignee : undefined,
	});

	const hasFilters = search !== "" || priority !== "ALL" || assignee !== "ALL";

	// Group cards by project
	const grouped = new Map<
		string,
		{ projectName: string; projectId: string; cards: NonNullable<typeof cards> }
	>();
	for (const card of cards ?? []) {
		const key = card.column.board.project.id;
		if (!grouped.has(key)) {
			grouped.set(key, {
				projectName: card.column.board.project.name,
				projectId: key,
				cards: [],
			});
		}
		grouped.get(key)!.cards.push(card);
	}

	return (
		<div className="mx-auto max-w-5xl px-4 py-6">
			<div className="mb-6">
				<h1 className="text-2xl font-bold">Dashboard</h1>
				<p className="text-sm text-muted-foreground">All cards across every project</p>
			</div>

			{/* Filters */}
			<div className="mb-6 flex items-center gap-3">
				<div className="relative w-64">
					<Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search cards..."
						className="h-8 pl-8 text-sm"
					/>
				</div>

				<Select value={priority} onValueChange={setPriority}>
					<SelectTrigger className="h-8 w-32 text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="ALL">All priorities</SelectItem>
						<SelectItem value="URGENT">Urgent</SelectItem>
						<SelectItem value="HIGH">High</SelectItem>
						<SelectItem value="MEDIUM">Medium</SelectItem>
						<SelectItem value="LOW">Low</SelectItem>
						<SelectItem value="NONE">None</SelectItem>
					</SelectContent>
				</Select>

				<Select value={assignee} onValueChange={setAssignee}>
					<SelectTrigger className="h-8 w-32 text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="ALL">All assignees</SelectItem>
						<SelectItem value="HUMAN">Human</SelectItem>
						<SelectItem value="AGENT">Agent</SelectItem>
						<SelectItem value="UNASSIGNED">Unassigned</SelectItem>
					</SelectContent>
				</Select>

				{hasFilters && (
					<Button
						variant="ghost"
						size="sm"
						className="h-8 px-2 text-xs"
						onClick={() => {
							setSearch("");
							setPriority("ALL");
							setAssignee("ALL");
						}}
					>
						<X className="mr-1 h-3 w-3" />
						Clear
					</Button>
				)}

				{cards && (
					<span className="ml-auto text-xs text-muted-foreground">
						{cards.length} card{cards.length !== 1 ? "s" : ""}
					</span>
				)}
			</div>

			{/* Card list grouped by project */}
			{isLoading ? (
				<p className="text-sm text-muted-foreground">Loading...</p>
			) : grouped.size === 0 ? (
				hasFilters ? (
					<p className="py-12 text-center text-muted-foreground">No cards match your filters.</p>
				) : (
					<div className="flex flex-col items-center justify-center py-16 text-center">
						<Rocket className="mb-4 h-12 w-12 text-muted-foreground" />
						<h2 className="text-lg font-semibold">Get started</h2>
						<p className="mt-1 max-w-md text-sm text-muted-foreground">
							No cards yet. Create a project and add cards, or explore the tutorial to see how
							everything works.
						</p>
						<div className="mt-6 flex items-center gap-3">
							<Link href="/projects">
								<Button>Go to Projects</Button>
							</Link>
							<Button
								variant="outline"
								onClick={() => seedTutorial.mutate()}
								disabled={seedTutorial.isPending}
							>
								{seedTutorial.isPending ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<BookOpen className="mr-2 h-4 w-4" />
								)}
								Create Tutorial Project
							</Button>
						</div>
					</div>
				)
			) : (
				<div className="space-y-8">
					{Array.from(grouped.values()).map((group) => (
						<div key={group.projectId}>
							<div className="mb-3 flex items-center gap-2">
								<h2 className="text-sm font-semibold">{group.projectName}</h2>
								<span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
									{group.cards.length}
								</span>
							</div>
							<div className="divide-y rounded-lg border">
								{group.cards.map((card) => {
									const tags: string[] = JSON.parse(card.tags);
									return (
										<div
											key={card.id}
											className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
										>
											<div
												className={`h-2 w-2 shrink-0 rounded-full ${priorityDots[card.priority] ?? priorityDots.NONE}`}
												title={card.priority}
											/>
											<span className="shrink-0 text-[10px] font-mono text-muted-foreground">
												#{card.number}
											</span>
											<div className="min-w-0 flex-1">
												<span className="text-sm font-medium">{card.title}</span>
												<div className="flex items-center gap-2 text-[10px] text-muted-foreground">
													<span>{card.column.name}</span>
													<span>in {card.column.board.name}</span>
												</div>
											</div>
											{tags.length > 0 && (
												<div className="hidden gap-1 sm:flex">
													{tags.slice(0, 2).map((tag) => (
														<Badge
															key={tag}
															variant="outline"
															className="px-1.5 py-0 text-[10px] font-normal"
														>
															{tag}
														</Badge>
													))}
												</div>
											)}
											{card.assignee && (
												<span className="shrink-0">
													{card.assignee === "AGENT" ? (
														<Bot className="h-3.5 w-3.5 text-purple-500" />
													) : (
														<User className="h-3.5 w-3.5 text-muted-foreground" />
													)}
												</span>
											)}
											<Link
												href={`/projects/${group.projectId}/boards/${card.column.board.id}`}
												className="shrink-0"
											>
												<ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
											</Link>
										</div>
									);
								})}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
