import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
	return (
		<div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4">
			<h1 className="text-4xl font-bold">404</h1>
			<p className="text-muted-foreground">The page you&apos;re looking for doesn&apos;t exist.</p>
			<Button asChild>
				<Link href="/">Go home</Link>
			</Button>
		</div>
	);
}
