import { createEnv } from "@t3-oss/env-nextjs";

import { z } from "zod";

export const env = createEnv({
	server: {
		NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
	},

	client: {
		NEXT_PUBLIC_SITE_URL: z.string().min(1),
	},

	runtimeEnv: {
		NODE_ENV: process.env.NODE_ENV,
		NEXT_PUBLIC_SITE_URL:
			process.env.NEXT_PUBLIC_SITE_URL ||
			(process.env.NEXT_PUBLIC_VERCEL_URL
				? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
				: "http://localhost:3000"),
	},

	skipValidation: !!process.env.SKIP_ENV_VALIDATION || process.env.NODE_ENV === "development",
	emptyStringAsUndefined: true,
});
