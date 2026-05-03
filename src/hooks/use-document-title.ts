"use client";

import { useEffect } from "react";

// Mirrors the `title.template` defined in src/app/layout.tsx so client pages
// can set a meaningful tab title without converting to server components just
// to use Next's `generateMetadata`. Pass `null` while data is still loading;
// the document keeps its previous title until a real value arrives. (#289)
//
// Why the MutationObserver: Next's App Router metadata sync runs on route
// mount and resets the title to the root layout's default ("Pigeon") a few
// ms after our `useEffect` fires — so a one-shot set loses the race on
// initial hard-load. Watching the <title> element and re-applying our value
// when something else (Next) writes a different one makes the hook robust
// to that race without forcing every client page into a server-shell +
// client-content split. The observer is cheap (one element, single-text
// mutation) and is torn down on unmount or when `title` changes. (#289)
const SUFFIX = " - Pigeon";

export function useDocumentTitle(title: string | null | undefined) {
	useEffect(() => {
		if (!title) return;
		const target = `${title}${SUFFIX}`;
		const titleEl = document.querySelector("title");
		document.title = target;
		if (!titleEl) return;
		const observer = new MutationObserver(() => {
			if (document.title !== target) document.title = target;
		});
		observer.observe(titleEl, { childList: true, characterData: true, subtree: true });
		return () => observer.disconnect();
	}, [title]);
}
