"use server";

import { decideQuoteByToken, markQuoteViewed, type CustomerDecisionResult } from "./public-quote";

/**
 * Thin server-action entry points for the customer page.
 *
 * Split from `public-quote.ts` so the UI imports only actions. These are
 * callable from the browser, so each one re-validates the token itself
 * rather than trusting anything the client sends.
 */

export async function approveQuote(token: string): Promise<CustomerDecisionResult> {
  return decideQuoteByToken(token, "approved");
}

export async function rejectQuote(
  token: string,
  reason: string,
): Promise<CustomerDecisionResult> {
  return decideQuoteByToken(token, "rejected", reason);
}

export async function recordView(token: string): Promise<void> {
  await markQuoteViewed(token);
}
