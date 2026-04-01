"use client";

import { ArrowLeft, LayoutGrid } from "lucide-react";
import Link from "next/link";
import { use } from "react";

import { CreateBoardDialog } from "@/components/project/create-board-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/trpc/react";

export default function ProjectPage({
	params,
}: {
	params: Promise<{ projectId: string }>;
}) {
	const { projectId } = use(params);
	const { data: project } = api.project.getById.useQuery({ id: projectId });
	const { data: boards, isLoading } = api.board.list.useQuery({ projectId });

	return (
		<div className="container mx-auto px-4 py-6">
			<div className="mb-6">
				<Link href="/projects">
					<Button variant="ghost" size="sm" className="mb-2">
						<ArrowLeft className="mr-2 h-4 w-4" />
						Projects
					</Button>
				</Link>
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-3xl font-bold tracking-tight">
							{project?.name ?? "..."}
						</h1>
						{project?.description && (
							<p className="text-muted-foreground">{project.description}</p>
						)}
					</div>
					<CreateBoardDialog projectId={projectId} />
				</div>
			</div>

			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{isLoading ? (
					Array.from({ length: 2 }).map((_, i) => (
						<Card key={i}>
							<CardHeader>
								<Skeleton className="h-5 w-32" />
								<Skeleton className="h-4 w-48" />
							</CardHeader>
						</Card>
					))
				) : boards?.length === 0 ? (
					<div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
						<LayoutGrid className="mb-4 h-12 w-12 text-muted-foreground" />
						<h2 className="text-lg font-semibold">No boards yet</h2>
						<p className="text-sm text-muted-foreground">
							Create a board to start tracking work.
						</p>
					</div>
				) : (
					boards?.map((board) => (
						<Link
							key={board.id}
							href={`/projects/${projectId}/boards/${board.id}`}
						>
							<Card className="transition-colors hover:bg-muted/50">
								<CardHeader>
									<CardTitle className="text-lg">{board.name}</CardTitle>
									{board.description && (
										<CardDescription>{board.description}</CardDescription>
									)}
								</CardHeader>
							</Card>
						</Link>
					))
				)}
			</div>
		</div>
	);
}
