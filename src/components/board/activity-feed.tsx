"use client";

import { Activity, Bot, ChevronRight, User, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { api } from "@/trpc/react";

type ActivityFeedProps = {
	boardId: string;
	onCardClick: (cardId: string) => void;
};

export function ActivityFeedToggle({ boardId, onCardClick }: ActivityFeedProps) {
	const [open, setOpen] = useState(false);

	return (
		<>
			<Button
				variant="outline"
				size="sm"
				className="h-8 gap-1.5 text-xs"
				onClick={() => setOpen(!open)}
			>
				<Activity className="h-3.5 w-3.5" />
				Activity
			</Button>

			{open && (
				<ActivityFeedPanel
					boardId={boardId}
					onCardClick={onCardClick}
					onClose={() => setOpen(false)}
				/>
			)}
		</>
	);
}

function ActivityFeedPanel({
	boardId,
	onCardClick,
	onClose,
}: ActivityFeedProps & { onClose: () => void }) {
	const { data: activities } = api.activity.listByBoard.useQuery({ boardId });

	return (
		<div className="fixed right-0 top-14 z-40 flex h-[calc(100dvh-3.5rem)] w-80 flex-col border-l bg-background shadow-lg">
			<div className="flex items-center justify-between border-b px-4 py-3">
				<div className="flex items-center gap-2">
					<Activity className="h-4 w-4" />
					<h3 className="text-sm font-semibold">Activity Feed</h3>
				</div>
				<Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
					<X className="h-4 w-4" />
				</Button>
			</div>

			<div className="flex-1 overflow-y-auto">
				{!activities || activities.length === 0 ? (
					<p className="p-4 text-center text-sm text-muted-foreground">
						No activity yet
					</p>
				) : (
					<div className="divide-y">
						{activities.map((activity) => (
							<button
								key={activity.id}
								type="button"
								className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
								onClick={() => onCardClick(activity.card.id)}
							>
								<div className="mt-0.5 shrink-0">
									{activity.actorType === "AGENT" ? (
										<Bot className="h-4 w-4 text-purple-500" />
									) : (
										<User className="h-4 w-4 text-muted-foreground" />
									)}
								</div>
								<div className="min-w-0 flex-1">
									<p className="text-xs">
										<span className="font-medium">
											{activity.actorName ??
												(activity.actorType === "AGENT" ? "Claude" : "You")}
										</span>{" "}
										<span className="text-muted-foreground">
											{activity.details ?? activity.action}
										</span>
									</p>
									<div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
										<span className="truncate font-mono">
											#{activity.card.number}
										</span>
										<span className="truncate">{activity.card.title}</span>
									</div>
									<span className="text-[10px] text-muted-foreground/60">
										{formatRelativeTime(new Date(activity.createdAt))}
									</span>
								</div>
								<ChevronRight className="mt-1 h-3 w-3 shrink-0 text-muted-foreground/40" />
							</button>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

function formatRelativeTime(date: Date): string {
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffSec = Math.floor(diffMs / 1000);
	const diffMin = Math.floor(diffSec / 60);
	const diffHr = Math.floor(diffMin / 60);
	const diffDay = Math.floor(diffHr / 24);

	if (diffSec < 60) return "just now";
	if (diffMin < 60) return `${diffMin}m ago`;
	if (diffHr < 24) return `${diffHr}h ago`;
	if (diffDay < 7) return `${diffDay}d ago`;
	return date.toLocaleDateString();
}
