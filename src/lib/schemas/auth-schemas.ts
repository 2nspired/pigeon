import { z } from "zod";

export const emailSchema = z
	.email("Invalid email.")
	.min(1, "Email is required.")
	.max(250, "Email is too long.")
	.toLowerCase()
	.trim();

export const passwordSchema = z
	.string()
	.min(8, "Password must be at least 8 characters long.")
	.max(30, "Password must be less than 30 characters long.")
	.trim();

export const loginSchema = z.object({
	email: emailSchema,
	password: passwordSchema,
});

export const signupSchema = z
	.object({
		email: emailSchema,
		password: passwordSchema,
		confirmPassword: passwordSchema,
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: "Passwords do not match.",
		path: ["confirmPassword"],
	});

export const resetPasswordSchema = z
	.object({
		password: passwordSchema,
		confirmPassword: passwordSchema,
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: "Passwords do not match.",
		path: ["confirmPassword"],
	});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
