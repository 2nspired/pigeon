"use client";

import { FileText, Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cardTemplates, type CardTemplate } from "@/lib/card-templates";
import { api } from "@/trpc/react";

export function CardCreateInline({ columnId, boardId }: { columnId: string; boardId: string }) {
	const [isCreating, setIsCreating] = useState(false);
	const [title, setTitle] = useState("");
	const [template, setTemplate] = useState<CardTemplate | null>(null);

	const utils = api.useUtils();

	const createCard = api.card.create.useMutation({
		onSuccess: (card) => {
			utils.board.getFull.invalidate({ id: boardId });
			// If template has checklist items, create them
			if (template?.checklist.length) {
				for (const text of template.checklist) {
					createChecklist.mutate({ cardId: card.id, text });
				}
			}
			setTitle("");
			setTemplate(null);
			setIsCreating(false);
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	const createChecklist = api.checklist.create.useMutation({
		onSuccess: () => {
			utils.board.getFull.invalidate({ id: boardId });
		},
	});

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!title.trim()) return;
		createCard.mutate({
			columnId,
			title: title.trim(),
			description: template?.description,
			priority: template?.priority,
			tags: template?.tags,
		});
	};

	const handleTemplate = (t: CardTemplate) => {
		setTemplate(t);
		setTitle(t.title);
		setIsCreating(true);
	};

	if (!isCreating) {
		return (
			<div className="flex gap-1">
				<Button
					variant="ghost"
					size="sm"
					className="flex-1 justify-start text-muted-foreground"
					onClick={() => setIsCreating(true)}
				>
					<Plus className="mr-2 h-4 w-4" />
					Add card
				</Button>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="h-8 w-8 text-muted-foreground"
							title="Create from template"
						>
							<FileText className="h-3.5 w-3.5" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{cardTemplates.map((t) => (
							<DropdownMenuItem key={t.name} onClick={() => handleTemplate(t)}>
								{t.name}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		);
	}

	return (
		<form onSubmit={handleSubmit} className="space-y-2">
			{template && (
				<div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
					<FileText className="h-3 w-3" />
					{template.name} template
				</div>
			)}
			<Input
				value={title}
				onChange={(e) => setTitle(e.target.value)}
				placeholder="Card title..."
				autoFocus
				onKeyDown={(e) => {
					if (e.key === "Escape") {
						setIsCreating(false);
						setTitle("");
						setTemplate(null);
					}
				}}
			/>
			<div className="flex gap-2">
				<Button type="submit" size="sm" disabled={createCard.isPending || !title.trim()}>
					Add
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => {
						setIsCreating(false);
						setTitle("");
						setTemplate(null);
					}}
				>
					<X className="h-4 w-4" />
				</Button>
			</div>
		</form>
	);
}
