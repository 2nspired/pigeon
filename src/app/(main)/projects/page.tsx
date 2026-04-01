"use client";

import { FolderOpen } from "lucide-react";
import Link from "next/link";

import { CreateProjectDialog } from "@/components/project/create-project-dialog";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/trpc/react";

export default function ProjectsPage() {
	const { data: projects, isLoading } = api.project.list.useQuery();

	return (
		<div className="container mx-auto px-4 py-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Projects</h1>
					<p className="text-muted-foreground">Manage your projects and boards.</p>
				</div>
				<CreateProjectDialog />
			</div>

			<div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{isLoading ? (
					Array.from({ length: 3 }).map((_, i) => (
						<Card key={i}>
							<CardHeader>
								<Skeleton className="h-5 w-32" />
								<Skeleton className="h-4 w-48" />
							</CardHeader>
						</Card>
					))
				) : projects?.length === 0 ? (
					<div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
						<FolderOpen className="mb-4 h-12 w-12 text-muted-foreground" />
						<h2 className="text-lg font-semibold">No projects yet</h2>
						<p className="text-sm text-muted-foreground">
							Create your first project to get started.
						</p>
					</div>
				) : (
					projects?.map((project) => (
						<Link key={project.id} href={`/projects/${project.id}`}>
							<Card className="transition-colors hover:bg-muted/50">
								<CardHeader>
									<CardTitle className="text-lg">{project.name}</CardTitle>
									{project.description && (
										<CardDescription>{project.description}</CardDescription>
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
