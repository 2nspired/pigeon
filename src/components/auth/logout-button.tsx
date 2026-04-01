"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createClient } from "@/utilities/supabase/client";

export function LogoutButton() {
	const router = useRouter();
	const supabase = createClient();

	const handleLogout = async () => {
		await supabase.auth.signOut();
		router.push("/login");
		router.refresh();
	};

	return (
		<Button variant="ghost" size="sm" onClick={handleLogout}>
			<LogOut className="h-4 w-4" />
			<span className="sr-only">Log out</span>
		</Button>
	);
}
