"use server";

import {
  decideChangeByToken,
  markChangeViewed,
  type PublicDecisionResult,
} from "./public-change";

/**
 * Server-action entry points for the public change-order page.
 *
 * These are reachable from the browser, so the token is re-validated
 * inside each one rather than trusted from the client.
 */

export async function approveChange(token: string): Promise<PublicDecisionResult> {
  return decideChangeByToken(token, "approved");
}

export async function rejectChange(
  token: string,
  reason: string,
): Promise<PublicDecisionResult> {
  return decideChangeByToken(token, "rejected", reason);
}

export async function recordChangeView(token: string): Promise<void> {
  await markChangeViewed(token);
}
