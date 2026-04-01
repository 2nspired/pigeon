"use client";

import { ArrowLeft, Check, Clock, NotebookPen, Pencil, X } from "lucide-react";
import Link from "next/link";
import { use, useRef, useState } from "react";
import { toast } from "sonner";

import { ActivityFeedToggle } from "@/components/board/activity-feed";
import { BoardView } from "@/components/board/board-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/trpc/react";

function EditableBoardName({
	boardId,
	name,
}: {
	boardId: string;
	name: string;
}) {
	const [editing, setEditing] = useState(false);
	const [value, setValue] = useState(name);
	const inputRef = useRef<HTMLInputElement>(null);
	const utils = api.useUtils();

	const updateBoard = api.board.update.useMutation({
		onSuccess: () => {
			utils.board.getFull.invalidate();
			setEditing(false);
			toast.success("Board renamed");
		},
		onError: (e) => toast.error(e.message),
	});

	const handleSave = () => {
		const trimmed = value.trim();
		if (!trimmed || trimmed === name) {
			setValue(name);
			setEditing(false);
			return;
		}
		updateBoard.mutate({ id: boardId, data: { name: trimmed } });
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") handleSave();
		if (e.key === "Escape") {
			setValue(name);
			setEditing(false);
		}
	};

	if (editing) {
		return (
			<div className="flex items-center gap-1">
				<Input
					ref={inputRef}
					value={value}
					onChange={(e) => setValue(e.target.value)}
					onKeyDown={handleKeyDown}
					onBlur={handleSave}
					className="h-7 w-48 text-lg font-semibold"
					autoFocus
				/>
			</div>
		);
	}

	return (
		<button
			type="button"
			onClick={() => { setEditing(true); setValue(name); }}
			className="group flex items-center gap-1.5 text-left"
		>
			<h1 className="text-lg font-semibold">{name}</h1>
			<Pencil className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
		</button>
	);
}

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
		<div className="flex h-[calc(100dvh-3.5rem-1px)] flex-col">
			<div className="flex items-center gap-3 border-b px-4 py-2">
				<Link href={`/projects/${projectId}`}>
					<Button variant="ghost" size="sm">
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back
					</Button>
				</Link>
				<div className="flex-1">
					<EditableBoardName boardId={board.id} name={board.name} />
					<p className="text-xs text-muted-foreground">
						{board.project.name}
					</p>
				</div>
				<Link href={`/projects/${projectId}?tab=notes&from=${boardId}`}>
					<Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
						<NotebookPen className="h-3.5 w-3.5" />
						Notes
					</Button>
				</Link>
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
