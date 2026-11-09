"use client";

import { useEffect, useState } from "react";

/**
 * Returns the current timestamp, but only after the component has mounted.
 *
 * Prerendered HTML must be deterministic, so any "now"-relative label (e.g.
 * "Expires in 3 days", "2 h ago") is rendered as `null` on the server and
 * resolved on the client. That keeps the static build valid and avoids a
 * hydration mismatch from a clock that moved between render passes.
 */
export function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    // Refresh once a minute so relative labels stay honest on long sessions.
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  return now;
}
