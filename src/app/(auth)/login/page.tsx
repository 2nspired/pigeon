"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { login } from "@/app/(auth)/auth/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
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

		const result = await login({ email, password });

		if (!result.success) {
			setError(result.error);
			setLoading(false);
			return;
		}

		router.push("/dashboard");
		router.refresh();
	};

	return (
		<Card className="w-full max-w-md">
			<CardHeader className="text-center">
				<CardTitle className="text-2xl">Welcome back</CardTitle>
				<CardDescription>Sign in to your account</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit} className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label htmlFor="email">Email</Label>
						<Input id="email" name="email" type="email" required autoComplete="email" />
					</div>
					<div className="flex flex-col gap-2">
						<div className="flex items-center justify-between">
							<Label htmlFor="password">Password</Label>
							<Link
								href="/auth/forgot"
								className="text-sm text-muted-foreground underline-offset-4 hover:underline"
							>
								Forgot password?
							</Link>
						</div>
						<Input
							id="password"
							name="password"
							type="password"
							required
							autoComplete="current-password"
						/>
					</div>

					{error && <p className="text-sm text-destructive">{error}</p>}

					<Button type="submit" className="w-full" disabled={loading}>
						{loading ? "Signing in..." : "Sign in"}
					</Button>
				</form>

				<p className="mt-4 text-center text-sm text-muted-foreground">
					Don&apos;t have an account?{" "}
					<Link href="/signup" className="underline underline-offset-4 hover:text-primary">
						Sign up
					</Link>
				</p>
			</CardContent>
		</Card>
	);
}
