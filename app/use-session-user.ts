"use client";

import { useEffect, useState } from "react";

import type { SessionUser } from "../lib/auth-shared";
import { loadSessionUser } from "./auth/session-actions";

/* ------------------------------------------------------------------
   The signed-in account, fetched by the shell rather than the layout.

   Why not read it in the root layout: `cookies()` there makes every route —
   including `/_not-found` — uncacheable and blocks prerendering. The layout
   must stay free of request data so the pages underneath can be statically
   prepared.

   Why not also inside the shell's server render: the shell is itself a Client
   Component rendered by every page, so a server read here would have the same
   effect one level down. Fetching after mount keeps the boundary clean and
   costs one small round-trip that only affects the account chip.
   ------------------------------------------------------------------ */

export function useSessionUser(): SessionUser | null {
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let active = true;
    // Fails silently: the account chip is chrome, and an unauthenticated
    // visitor is already being redirected by the proxy and the pages.
    loadSessionUser().then((result) => {
      if (active) setUser(result);
    });
    return () => {
      active = false;
    };
  }, []);

  return user;
}
