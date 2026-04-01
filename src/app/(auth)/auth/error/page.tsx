import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AuthErrorPage(props: {
	searchParams: Promise<{ message?: string }>;
}) {
	const searchParams = await props.searchParams;
	const message = searchParams.message ?? "An authentication error occurred.";

	return (
		<Card className="w-full max-w-md">
			<CardHeader className="text-center">
				<CardTitle className="text-2xl">Something went wrong</CardTitle>
				<CardDescription>{message}</CardDescription>
			</CardHeader>
			<CardContent className="flex justify-center">
				<Button asChild>
					<Link href="/login">Back to sign in</Link>
				</Button>
			</CardContent>
		</Card>
	);
}
