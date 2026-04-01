"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { resetPassword } from "@/app/(auth)/auth/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ResetPasswordPage() {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setError(null);
		setLoading(true);

		const formData = new FormData(e.currentTarget);
		const password = formData.get("password") as string;
		const confirmPassword = formData.get("confirmPassword") as string;

		const result = await resetPassword({ password, confirmPassword });

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
				<CardTitle className="text-2xl">Set new password</CardTitle>
				<CardDescription>Enter your new password below</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit} className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label htmlFor="password">New Password</Label>
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
						{loading ? "Resetting..." : "Reset password"}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
