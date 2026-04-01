"use client";

import { ArrowLeft, Clock } from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";

import { ActivityFeedToggle } from "@/components/board/activity-feed";
import { BoardView } from "@/components/board/board-view";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/trpc/react";

export default function BoardPage({
	params,
}: {
	params: Promise<{ projectId: string; boardId: string }>;
}) {
	const { projectId, boardId } = use(params);

	const { data: board, isLoading } = api.board.getFull.useQuery(
		{ id: boardId },
		{ refetchInterval: 3000 },
	);

	if (isLoading) {
		return (
			<div className="flex h-full flex-col">
				<div className="border-b px-4 py-3">
					<Skeleton className="h-6 w-48" />
				</div>
				<div className="flex flex-1 gap-4 p-4">
					{Array.from({ length: 3 }).map((_, i) => (
						<Skeleton key={i} className="h-96 w-72 shrink-0" />
					))}
				</div>
			</div>
		);
	}

	if (!board) {
		return (
			<div className="flex items-center justify-center py-16">
				<p className="text-muted-foreground">Board not found.</p>
			</div>
		);
	}

	return (
		<div className="flex h-[calc(100dvh-3.5rem)] flex-col">
			<div className="flex items-center gap-3 border-b px-4 py-2">
				<Link href={`/projects/${projectId}`}>
					<Button variant="ghost" size="sm">
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back
					</Button>
				</Link>
				<div className="flex-1">
					<h1 className="text-lg font-semibold">{board.name}</h1>
					<p className="text-xs text-muted-foreground">
						{board.project.name}
					</p>
				</div>
				<Link href={`/projects/${projectId}/boards/${boardId}/timeline`}>
					<Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
						<Clock className="h-3.5 w-3.5" />
						Timeline
					</Button>
				</Link>
				<ActivityFeedToggle boardId={board.id} onCardClick={() => {}} />
			</div>
			<BoardView board={board} />
		</div>
	);
}
