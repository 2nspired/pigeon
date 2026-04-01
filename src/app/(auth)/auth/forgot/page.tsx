"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendPasswordResetEmail } from "@/app/(auth)/auth/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setError(null);
		setLoading(true);

		const formData = new FormData(e.currentTarget);
		const email = formData.get("email") as string;

		const result = await sendPasswordResetEmail(email);

		if (!result.success) {
			setError(result.error);
			setLoading(false);
			return;
		}

		router.push("/auth/check-email");
	};

	return (
		<Card className="w-full max-w-md">
			<CardHeader className="text-center">
				<CardTitle className="text-2xl">Forgot password</CardTitle>
				<CardDescription>Enter your email to receive a reset link</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit} className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label htmlFor="email">Email</Label>
						<Input id="email" name="email" type="email" required autoComplete="email" />
					</div>

					{error && <p className="text-sm text-destructive">{error}</p>}

					<Button type="submit" className="w-full" disabled={loading}>
						{loading ? "Sending..." : "Send reset link"}
					</Button>
				</form>

				<p className="mt-4 text-center text-sm text-muted-foreground">
					<Link href="/login" className="underline underline-offset-4 hover:text-primary">
						Back to sign in
					</Link>
				</p>
			</CardContent>
		</Card>
	);
}
