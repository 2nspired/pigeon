import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { supabaseServerClient } from "@/utilities/supabase/server";

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const token_hash = searchParams.get("token_hash");
		const type = searchParams.get("type") as EmailOtpType | null;
		const code = searchParams.get("code");
		const next = (searchParams.get("next") ?? "/") as Parameters<typeof redirect>[0];

		const supabase = await supabaseServerClient();

		// Handle PKCE code (modern flow)
		if (code) {
			const { error } = await supabase.auth.exchangeCodeForSession(code);

			if (!error) {
				if (type === "recovery") {
					redirect("/auth/reset");
				}
				redirect(next);
			}

			console.error("[CONFIRM] Error exchanging code:", error.message);

			if (type === "signup") {
				redirect("/login?confirmed=true");
			}
		}

		// Handle token_hash (legacy flow)
		if (token_hash && type) {
			const { error } = await supabase.auth.verifyOtp({ type, token_hash });

			if (!error) {
				redirect(next);
			}

			console.error("[CONFIRM] Error verifying OTP:", error.message);

			if (type === "signup") {
				redirect("/login?confirmed=true");
			}
		}

		redirect("/auth/error?message=Invalid or expired confirmation link");
	} catch (error) {
		// redirect() throws a NEXT_REDIRECT error by design — re-throw it
		if (error && typeof error === "object" && "digest" in error) {
			const digest = (error as { digest?: string }).digest;
			if (digest?.includes("NEXT_REDIRECT")) {
				throw error;
			}
		}

		console.error("[CONFIRM] Unexpected error:", error);
		redirect("/auth/error?message=An unexpected error occurred during confirmation");
	}
}
