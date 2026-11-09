import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";

/* ------------------------------------------------------------------
   The authenticated area.

   Every workspace screen lives under this layout, which checks the session
   against the database on each request.

   This is the real gate. The proxy can only see whether a cookie is present —
   it never touches the database, because it runs on every request and must
   stay cheap. That makes it useful for bouncing anonymous visitors, and
   useless as authorisation: anyone can invent a cookie value. Without this
   layout, a forged cookie would render the workspace with real data.

   `getCurrentUser` calls `connection()` internally, so this layout is
   request-time by construction and is never prerendered.

   `instant = false` states that plainly. Without it, the router still tries to
   produce an instant static shell for these routes and reports the auth check
   as a blocking route — which it is, unavoidably: the answer depends on the
   visitor's cookie, so there is no shell that can be correct for everyone.
   Marking it removes the false alarm and skips work that could never succeed.
   ------------------------------------------------------------------ */

export const instant = false;

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <>{children}</>;
}
