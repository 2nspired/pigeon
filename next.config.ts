import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	typedRoutes: true,

	experimental: {
		optimizePackageImports: ["lucide-react", "@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities"],
	},

	compiler: {
		removeConsole: process.env.NODE_ENV === "production",
	},

	async headers() {
		return [
			{
				source: "/(.*)",
				headers: [
					{ key: "X-Content-Type-Options", value: "nosniff" },
					{ key: "X-Frame-Options", value: "DENY" },
					{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
				],
			},
		];
	},
};

export default nextConfig;
