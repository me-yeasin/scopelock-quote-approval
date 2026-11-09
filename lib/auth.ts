import { randomBytes, createHash } from "node:crypto";

import { ObjectId, type Db } from "mongodb";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { cache } from "react";

import { getDb } from "./db";
import { hashPassword, verifyPassword } from "./password";
import { normaliseEmail, type SessionUser } from "./auth-shared";

/* ------------------------------------------------------------------
   Authentication — server only.

   Scheme: opaque random session tokens stored in MongoDB, referenced by an
   HttpOnly cookie.

   Why server sessions rather than a signed JWT: revocation. Logging out, or
   disabling an account, must take effect immediately. A self-contained token
   cannot be withdrawn before it expires without keeping a denylist — which is
   a session table with extra steps. A stored session is simpler and strictly
   more correct here.

   The cookie holds a random 32-byte token; the database holds only its
   SHA-256. A leaked database backup therefore yields no usable sessions.
   ------------------------------------------------------------------ */

const SESSION_COOKIE = "sl_session";
const SESSION_DAYS = 14;

/* The cookie must be honoured over plain HTTP on localhost during development,
   but marked Secure everywhere else. */
const COOKIE_SECURE = process.env.NODE_ENV === "production";

export type UserDoc = {
  _id?: ObjectId;
  name: string;
  email: string;
  companyName: string;
  /** scrypt hash — never leaves the server. */
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
};

type SessionDoc = {
  _id?: ObjectId;
  /** SHA-256 of the token; the raw token lives only in the cookie. */
  tokenHash: string;
  userId: ObjectId;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
  userAgent?: string;
};

export function usersCollection(db: Db) {
  return db.collection<UserDoc>("users");
}

export function sessionsCollection(db: Db) {
  return db.collection<SessionDoc>("sessions");
}

let indexesEnsured = false;

async function ensureIndexes(db: Db) {
  if (indexesEnsured) return;

  // One account per email. Enforced by the database, not by a read-then-write
  // check, so two simultaneous sign-ups cannot both succeed.
  await usersCollection(db).createIndex({ email: 1 }, { unique: true });

  // Token lookup, and a TTL index so expired sessions clean themselves up.
  await sessionsCollection(db).createIndex({ tokenHash: 1 }, { unique: true });
  await sessionsCollection(db).createIndex({ userId: 1 });
  await sessionsCollection(db).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  indexesEnsured = true;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Never send the hash to the browser. */
function toSessionUser(doc: UserDoc): SessionUser {
  return {
    id: String(doc._id),
    name: doc.name,
    email: doc.email,
    companyName: doc.companyName,
    createdAt: doc.createdAt,
  };
}

/* ------------------------------------------------------------------
   Sign up
   ------------------------------------------------------------------ */

export type CreateUserResult =
  | { ok: true; user: SessionUser; userId: ObjectId }
  | { ok: false; error: string; field?: "email" | "form" };

export async function createUser(input: {
  name: string;
  email: string;
  companyName: string;
  password: string;
}): Promise<CreateUserResult> {
  const db = await getDb();
  await ensureIndexes(db);

  const email = normaliseEmail(input.email);
  const now = new Date().toISOString();

  const doc: UserDoc = {
    _id: new ObjectId(),
    name: input.name.trim(),
    email,
    companyName: input.companyName.trim(),
    passwordHash: await hashPassword(input.password),
    createdAt: now,
    updatedAt: now,
  };

  try {
    await usersCollection(db).insertOne(doc);
  } catch (error) {
    // 11000 is MongoDB's duplicate-key code — the unique index caught a race
    // between two sign-ups for the same address.
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      return {
        ok: false,
        field: "email",
        error: "An account with this email already exists. Try signing in instead.",
      };
    }
    throw error;
  }

  return { ok: true, user: toSessionUser(doc), userId: doc._id! };
}

/* ------------------------------------------------------------------
   Sign in
   ------------------------------------------------------------------ */

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<{ ok: true; user: UserDoc; upgradedHash?: string } | { ok: false }> {
  const db = await getDb();
  await ensureIndexes(db);

  const user = await usersCollection(db).findOne({ email: normaliseEmail(email) });

  // Hash even when the user does not exist, so response time does not reveal
  // which addresses are registered.
  if (!user) {
    await verifyPassword(password, "scrypt$32768$8$1$00$00");
    return { ok: false };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return { ok: false };

  const { needsRehash } = await import("./password");
  const upgradedHash = needsRehash(user.passwordHash) ? await hashPassword(password) : undefined;

  return { ok: true, user, upgradedHash };
}

/* ------------------------------------------------------------------
   Sessions
   ------------------------------------------------------------------ */

export async function createSession(userId: ObjectId, userAgent?: string): Promise<void> {
  const db = await getDb();
  await ensureIndexes(db);

  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await sessionsCollection(db).insertOne({
    tokenHash: hashToken(token),
    userId,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    lastSeenAt: now.toISOString(),
    userAgent: userAgent?.slice(0, 200),
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true, // unreadable from JavaScript, so XSS cannot steal it
    secure: COOKIE_SECURE,
    sameSite: "lax", // blocks cross-site POSTs while keeping normal links working
    path: "/",
    expires,
  });
}

/** Delete the current session and clear the cookie. */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token) {
    const db = await getDb();
    await sessionsCollection(db).deleteOne({ tokenHash: hashToken(token) });
  }

  store.delete(SESSION_COOKIE);
}

/**
 * The signed-in user, or null.
 *
 * Wrapped in `cache` so several calls in one request hit the database once.
 * This is the *secure* check — it validates against the database, so deleting
 * a session invalidates access immediately.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  /*
    Mark this as request-time work.

    The session lookup is per-request by definition — it depends on a cookie and
    on the current clock (a session can expire between two requests). Reading
    `cookies()` alone does not fully signal that to the compiler, so prerendering
    would try to bake the result in and fail on `Date.now()`.

    Calling `connection()` stops prerendering here and makes the whole subtree
    dynamic, which is what the auth check needs to be.
  */
  await connection();

  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = await getDb();
  const session = await sessionsCollection(db).findOne({ tokenHash: hashToken(token) });
  if (!session) return null;

  // The TTL index removes expired rows lazily (about once a minute), so an
  // expired session must be rejected on read as well.
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    await sessionsCollection(db).deleteOne({ _id: session._id });
    return null;
  }

  const user = await usersCollection(db).findOne({ _id: session.userId });
  if (!user) return null;

  return toSessionUser(user);
});

/**
 * Require a signed-in user inside a page, layout or server action.
 *
 * Server actions are reachable by direct POST, so every mutating action must
 * call this rather than trusting that the UI was rendered.
 */
export async function requireUser(): Promise<SessionUser> {
  const { redirect } = await import("next/navigation");

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // `redirect` is typed as `never` only in some overloads, so narrow here.
  return user as SessionUser;
}

/**
 * A cheap signal for the proxy: is a session cookie present?
 *
 * Intentionally does NOT hit the database — the proxy runs on every request and
 * must stay fast. It only decides whether to *bounce* obviously anonymous
 * visitors; the real check happens in pages and actions.
 */
export function hasSessionCookie(token: string | undefined): boolean {
  return typeof token === "string" && token.length > 20;
}

export { SESSION_COOKIE };
