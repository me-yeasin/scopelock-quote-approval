/* ------------------------------------------------------------------
   Auth — shared types and validation.

   No database import here: the sign-up and login forms are Client Components
   and import these rules directly, so the same constraints run in the browser
   (instant feedback) and on the server (the only run that matters).
   ------------------------------------------------------------------ */

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  companyName: string;
  createdAt: string;
};

export type AuthResult =
  | { ok: true }
  | { ok: false; error: string; field?: "name" | "email" | "companyName" | "password" | "form" };

/* ---------------- Field limits ----------------
   Generous but bounded. The limits exist to stop absurd payloads reaching the
   hasher, not to be fussy about names. */
export const LIMITS = {
  name: 80,
  email: 254, // RFC 5321 maximum
  companyName: 120,
  password: { min: 8, max: 200 },
} as const;

export type SignUpInput = {
  name: string;
  email: string;
  companyName: string;
  password: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

/**
 * Normalise an email for storage and lookup.
 *
 * Lowercasing ensures one account per address regardless of how it was typed.
 * The local part is technically case-sensitive per RFC 5321 but no real mail
 * provider treats it that way, and the alternative is two accounts that look
 * identical to the user.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Deliberately permissive check: something@something.tld with no spaces.
 *
 * Strict RFC validation rejects addresses that genuinely work, so the real
 * test is whether a confirmation email arrives. This catches typos only.
 */
export function isEmailShape(email: string): boolean {
  const value = normaliseEmail(email);
  if (value.length < 5 || value.length > LIMITS.email) return false;
  if (/\s/.test(value)) return false;
  return /^[^@]+@[^@.]+(\.[^@.]+)+$/.test(value);
}

export function validateSignUp(input: SignUpInput): AuthResult {
  const name = input.name.trim();
  const companyName = input.companyName.trim();
  const email = normaliseEmail(input.email);
  const password = input.password ?? "";

  if (name.length < 2) {
    return { ok: false, field: "name", error: "Enter your name." };
  }
  if (name.length > LIMITS.name) {
    return { ok: false, field: "name", error: `Keep your name under ${LIMITS.name} characters.` };
  }

  if (!isEmailShape(email)) {
    return { ok: false, field: "email", error: "Enter a valid email address." };
  }

  if (companyName.length < 2) {
    return { ok: false, field: "companyName", error: "Enter your company name." };
  }
  if (companyName.length > LIMITS.companyName) {
    return {
      ok: false,
      field: "companyName",
      error: `Keep your company name under ${LIMITS.companyName} characters.`,
    };
  }

  if (password.length < LIMITS.password.min) {
    return {
      ok: false,
      field: "password",
      error: `Use at least ${LIMITS.password.min} characters.`,
    };
  }
  if (password.length > LIMITS.password.max) {
    return {
      ok: false,
      field: "password",
      error: `Keep your password under ${LIMITS.password.max} characters.`,
    };
  }

  return { ok: true };
}

export function validateLogin(input: LoginInput): AuthResult {
  if (!isEmailShape(input.email)) {
    return { ok: false, field: "email", error: "Enter a valid email address." };
  }
  if (!input.password) {
    return { ok: false, field: "password", error: "Enter your password." };
  }
  return { ok: true };
}

/**
 * Rough password strength, for the sign-up meter.
 *
 * Length dominates because it matters far more than character-class tricks.
 * This is advice, not a gate — the only hard rule is the minimum length.
 */
export function passwordStrength(password: string): { score: 0 | 1 | 2 | 3; label: string } {
  if (password.length === 0) return { score: 0, label: "" };
  if (password.length < LIMITS.password.min) return { score: 1, label: "Too short" };

  let score = 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1;

  const capped = Math.min(3, score) as 1 | 2 | 3;
  return { score: capped, label: ["", "Weak", "Fair", "Strong"][capped] };
}

/** Where a signed-in user should land, guarded against open redirects. */
export function safeNextPath(next: string | undefined | null): string {
  if (!next) return "/";
  // Only same-site absolute paths are allowed. "//evil.com" is rejected
  // because a leading double slash is treated as protocol-relative by browsers.
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}
