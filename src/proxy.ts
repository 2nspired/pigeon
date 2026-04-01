import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export default function proxy(_request: NextRequest) {
	return NextResponse.next();
}

export const config = {
	matcher: [
		"/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
	],
};
