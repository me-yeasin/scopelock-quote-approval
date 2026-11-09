"use server";

import { getCurrentUser } from "@/lib/auth";
import type { SessionUser } from "@/lib/auth-shared";

/**
 * The signed-in account, for the sidebar chip.
 *
 * Returns null rather than throwing so a signed-out or expired session never
 * breaks the chrome — the proxy is already sending those users to /login.
 */
export async function loadSessionUser(): Promise<SessionUser | null> {
  try {
    return await getCurrentUser();
  } catch {
    return null;
  }
}
