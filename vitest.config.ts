import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react()],
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: ["./src/__tests__/setup.ts"],
		exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/.claude/**"],
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			"prisma/generated/client": path.resolve(__dirname, "./prisma/generated/client.ts"),
		},
	},
});
