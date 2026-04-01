"use client";

import { createContext, use, useContext } from "react";

import type { Auth } from "@/utilities/auth/server";

const AuthContext = createContext<Auth | null>(null);

export function useAuth() {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return context;
}

export function AuthProvider({
	children,
	loggedIn,
}: {
	children: React.ReactNode;
	loggedIn: Promise<Auth>;
}) {
	const auth = use(loggedIn);
	return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}
