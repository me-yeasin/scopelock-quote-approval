import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/* ------------------------------------------------------------------
   Password hashing.

   Uses Node's built-in scrypt rather than adding bcrypt or argon2. scrypt is
   memory-hard, has no native build step or supply-chain surface, and ships
   with the runtime. For a single-tenant tool that is the right trade.

   Storage format is a self-describing string:

       scrypt$<N>$<r>$<p>$<salt-hex>$<hash-hex>

   Embedding the parameters means the cost can be raised later without
   invalidating existing hashes — old passwords keep verifying with their
   original settings and can be transparently rehashed on next login.
   ------------------------------------------------------------------ */

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// 2^15 ≈ 33 ms per hash here: slow enough to make guessing expensive, fast
// enough that a login feels instant.
const PARAMS = { N: 32768, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;

/** scrypt needs roughly 128 * N * r bytes; allow generous headroom. */
const MAX_MEM = 64 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, {
    ...PARAMS,
    maxmem: MAX_MEM,
  });

  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("hex"),
    derived.toString("hex"),
  ].join("$");
}

/**
 * Verify a password against a stored hash.
 *
 * Returns false for anything malformed rather than throwing: a corrupt record
 * should deny access, not crash the login route.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;

    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const salt = Buffer.from(parts[4], "hex");
    const expected = Buffer.from(parts[5], "hex");

    if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
    if (salt.length === 0 || expected.length === 0) return false;

    const derived = await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N,
      r,
      p,
      maxmem: MAX_MEM,
    });

    // Constant-time comparison, so a wrong password cannot be narrowed down
    // by timing.
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/**
 * True when a hash was made with weaker parameters than the current ones.
 *
 * Lets login quietly upgrade old hashes without a migration script.
 */
export function needsRehash(stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return true;

  return (
    Number(parts[1]) < PARAMS.N || Number(parts[2]) < PARAMS.r || Number(parts[3]) < PARAMS.p
  );
}
