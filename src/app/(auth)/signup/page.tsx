"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signup } from "@/app/(auth)/auth/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignupPage() {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setError(null);
		setLoading(true);

		const formData = new FormData(e.currentTarget);
		const email = formData.get("email") as string;
		const password = formData.get("password") as string;
		const confirmPassword = formData.get("confirmPassword") as string;

		const result = await signup({ email, password, confirmPassword });

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
				<CardTitle className="text-2xl">Create an account</CardTitle>
				<CardDescription>Enter your details to get started</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit} className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label htmlFor="email">Email</Label>
						<Input id="email" name="email" type="email" required autoComplete="email" />
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="password">Password</Label>
						<Input
							id="password"
							name="password"
							type="password"
							required
							autoComplete="new-password"
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="confirmPassword">Confirm Password</Label>
						<Input
							id="confirmPassword"
							name="confirmPassword"
							type="password"
							required
							autoComplete="new-password"
						/>
					</div>

					{error && <p className="text-sm text-destructive">{error}</p>}

					<Button type="submit" className="w-full" disabled={loading}>
						{loading ? "Creating account..." : "Sign up"}
					</Button>
				</form>

				<p className="mt-4 text-center text-sm text-muted-foreground">
					Already have an account?{" "}
					<Link href="/login" className="underline underline-offset-4 hover:text-primary">
						Sign in
					</Link>
				</p>
			</CardContent>
		</Card>
	);
}
