"use client";

// Forces the /jobs/new page to fully remount every time it is entered.
//
// Why: the Next.js App Router caches the rendered page (including client
// component state) across client-side navigations. Without this, returning to
// /jobs/new after a completed save would restore the previous "saved" state and
// show the success screen again instead of a fresh form. Keying the page's
// subtree with a value that changes on each entry makes React unmount the old
// instance and mount a new one, so it always starts clean.
//
// The homepage ("/") is left alone — it only gets the normal per-route remount.

import { usePathname } from "next/navigation";
import { useRef, type ReactNode } from "react";

let entryId = 0;

export default function KeyedChildren({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const previous = useRef<string | null>(null);

  // Bump the id only on the transition into /jobs/new, so each entry gets a new
  // key without churning on unrelated re-renders.
  if (pathname === "/jobs/new" && previous.current !== "/jobs/new") {
    entryId += 1;
  }
  previous.current = pathname;

  const key = pathname === "/jobs/new" ? `new-job-${entryId}` : pathname;

  return (
    <div key={key} style={{ display: "contents" }}>
      {children}
    </div>
  );
}
