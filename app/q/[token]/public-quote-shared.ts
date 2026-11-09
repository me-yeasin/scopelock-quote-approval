/* ------------------------------------------------------------------
   Pure helpers shared by the public quote page and its actions.

   Kept out of the "use server" modules because a Server Action file may
   only export async functions — every export there becomes an endpoint.
   These are ordinary synchronous utility functions.
   ------------------------------------------------------------------ */

/** A token produced by newLinkToken(): 32 lowercase hex characters. */
const TOKEN_PATTERN = /^[a-f0-9]{32}$/;

export function isValidToken(token: string | undefined | null): token is string {
  return typeof token === "string" && TOKEN_PATTERN.test(token);
}

/**
 * Has this quote passed its validity date?
 *
 * Compares whole days in UTC and treats the quote as valid *through* the
 * end of its final day, matching how `expireStaleQuotes` reads
 * `validUntil`.
 */
export function isExpired(validUntil: string, now: Date): boolean {
  if (!validUntil) return false;
  const end = new Date(validUntil);
  if (Number.isNaN(end.getTime())) return false;

  const endOfDay = Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate(),
    23,
    59,
    59,
    999,
  );
  return now.getTime() > endOfDay;
}
