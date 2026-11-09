"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  createSession,
  createUser,
  destroySession,
  verifyCredentials,
  usersCollection,
} from "@/lib/auth";
import { getDb } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { claimOrphanDocuments, ensureOwnershipIndexes } from "@/lib/ownership-migrate";
import {
  normaliseEmail,
  safeNextPath,
  validateLogin,
  validateSignUp,
  type AuthResult,
} from "@/lib/auth-shared";

/* ------------------------------------------------------------------
   Auth server actions.

   Validation runs here even though the forms validate too: the client check
   is a courtesy, this one is the boundary. Nothing trusts a submitted value.
   ------------------------------------------------------------------ */

/** Coarse per-email throttle, in process memory. */
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 10 * 60 * 1000;

function throttled(key: string) {
  const now = Date.now();
  const record = attempts.get(key);

  if (!record || record.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  record.count += 1;
  return record.count > MAX_ATTEMPTS;
}

function clearThrottle(key: string) {
  attempts.delete(key);
}

async function userAgent() {
  try {
    return (await headers()).get("user-agent") ?? undefined;
  } catch {
    return undefined;
  }
}

export async function signUpAction(formData: FormData): Promise<AuthResult> {
  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "");
  const companyName = String(formData.get("companyName") ?? "");
  const password = String(formData.get("password") ?? "");

  const validated = validateSignUp({ name, email, companyName, password });
  if (!validated.ok) return validated;

  const throttleKey = `signup:${normaliseEmail(email)}`;
  if (throttled(throttleKey)) {
    return { ok: false, field: "form", error: "Too many attempts. Please wait a few minutes." };
  }

  try {
    const created = await createUser({ name, email, companyName, password });
    if (!created.ok) return created;

    await createSession(created.userId, await userAgent());

    // Hand any pre-auth documents to the first account that ever signs in.
    await claimOrphanDocuments(created.userId.toHexString());
    await ensureOwnershipIndexes();
  } catch (error) {
    console.error("signUpAction failed", error);
    return {
      ok: false,
      field: "form",
      error: "We could not create your account just now. Please try again.",
    };
  }

  redirect("/");
}

export async function signInAction(formData: FormData, next?: string): Promise<AuthResult> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const validated = validateLogin({ email, password });
  if (!validated.ok) return validated;

  const throttleKey = `login:${normaliseEmail(email)}`;
  if (throttled(throttleKey)) {
    return { ok: false, field: "form", error: "Too many attempts. Please wait a few minutes." };
  }

  try {
    const verified = await verifyCredentials(email, password);

    if (!verified.ok) {
      // One message for both wrong email and wrong password. Saying which is
      // wrong would confirm whether an address has an account.
      return { ok: false, field: "form", error: "Email or password is incorrect." };
    }

    // Quietly upgrade the stored hash if it predates the current parameters.
    if (verified.upgradedHash) {
      const db = await getDb();
      await usersCollection(db).updateOne(
        { _id: verified.user._id },
        { $set: { passwordHash: verified.upgradedHash, updatedAt: new Date().toISOString() } },
      );
    }

    await createSession(verified.user._id!, await userAgent());

    // Re-running this is cheap: it returns immediately after the one-time
    // handover has been recorded.
    await claimOrphanDocuments(verified.user._id!.toHexString());
    await ensureOwnershipIndexes();
    clearThrottle(throttleKey);
  } catch (error) {
    console.error("signInAction failed", error);
    return {
      ok: false,
      field: "form",
      error: "We could not sign you in just now. Please try again.",
    };
  }

  redirect(safeNextPath(next));
}

export async function signOutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
