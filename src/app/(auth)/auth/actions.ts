"use server";

import { revalidatePath } from "next/cache";

import type { LoginInput, ResetPasswordInput, SignupInput } from "@/lib/schemas/auth-schemas";
import { loginSchema, resetPasswordSchema, signupSchema } from "@/lib/schemas/auth-schemas";
import type { ActionResult } from "@/types/action-result";
import { supabaseServerClient } from "@/utilities/supabase/server";

export async function login(credentials: LoginInput): Promise<ActionResult> {
	try {
		const supabase = await supabaseServerClient();

		const validated = loginSchema.safeParse(credentials);
		if (!validated.success) {
			return {
				success: false,
				error: validated.error.issues[0]?.message ?? "Invalid credentials",
			};
		}

		const { email, password } = validated.data;

		const { error } = await supabase.auth.signInWithPassword({ email, password });

		if (error) {
			return { success: false, error: error.message, code: error.code };
		}

		revalidatePath("/", "layout");
		return { success: true, message: "Login successful." };
	} catch (error) {
		console.error("[LOGIN] Unexpected error:", error);
		return { success: false, error: "An unexpected error occurred. Please try again." };
	}
}

export async function signup(credentials: SignupInput): Promise<ActionResult> {
	try {
		const supabase = await supabaseServerClient();

		const validated = signupSchema.safeParse(credentials);
		if (!validated.success) {
			return {
				success: false,
				error: validated.error.issues[0]?.message ?? "Invalid credentials",
			};
		}

		const { email, password } = validated.data;

		const { data, error } = await supabase.auth.signUp({
			email,
			password,
			options: {
				emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
			},
		});

		if (error) {
			return { success: false, error: error.message };
		}

		if (!data.user) {
			return { success: false, error: "User not created. Please try again." };
		}

		revalidatePath("/", "layout");
		return { success: true, message: "Check your email to confirm your account." };
	} catch (error) {
		console.error("[SIGNUP] Unexpected error:", error);
		return { success: false, error: "An unexpected error occurred. Please try again." };
	}
}

export async function sendPasswordResetEmail(email: string): Promise<ActionResult> {
	try {
		const supabase = await supabaseServerClient();

		const { error } = await supabase.auth.resetPasswordForEmail(email, {
			redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm?type=recovery`,
		});

		if (error) {
			return { success: false, error: error.message };
		}

		return { success: true, message: "Password reset email sent." };
	} catch (error) {
		console.error("[RESET_PASSWORD_EMAIL] Unexpected error:", error);
		return { success: false, error: "Failed to send reset email. Please try again." };
	}
}

export async function resetPassword(credentials: ResetPasswordInput): Promise<ActionResult> {
	try {
		const supabase = await supabaseServerClient();

		const validated = resetPasswordSchema.safeParse(credentials);
		if (!validated.success) {
			return {
				success: false,
				error: validated.error.issues[0]?.message ?? "Invalid password format.",
			};
		}

		const { error } = await supabase.auth.updateUser({
			password: validated.data.password,
		});

		if (error) {
			return { success: false, error: error.message };
		}

		revalidatePath("/", "layout");
		return { success: true, message: "Password reset successfully." };
	} catch (error) {
		console.error("[RESET_PASSWORD] Unexpected error:", error);
		return { success: false, error: "Failed to reset password. Please try again." };
	}
}
