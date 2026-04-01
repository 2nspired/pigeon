import { Mail } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CheckEmailPage() {
	return (
		<Card className="w-full max-w-md">
			<CardHeader className="text-center">
				<div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
					<Mail className="h-6 w-6" />
				</div>
				<CardTitle className="text-2xl">Check your email</CardTitle>
				<CardDescription>
					We&apos;ve sent you a confirmation link. Click the link in the email to continue.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex justify-center">
				<Button variant="outline" asChild>
					<Link href="/login">Back to sign in</Link>
				</Button>
			</CardContent>
		</Card>
	);
}
