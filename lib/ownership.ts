import type { Filter, Document } from "mongodb";

import { getCurrentUser } from "./auth";

/* ------------------------------------------------------------------
   Ownership scope.

   Every workspace document carries an `ownerId` — the hex string of the user
   who created it. This module is the single place that answers "whose data is
   this?", so scoping is applied consistently instead of being re-remembered at
   each call site (where one omission leaks another tenant's data).

   Two rules keep the model simple:

   1. `ownerId` is written once, at creation, and never changes.
   2. Every read and every write is filtered by it. There is no "admin" bypass,
      because there is no admin concept — one account, one workspace.
   ------------------------------------------------------------------ */

export class Unauthorised extends Error {
  constructor(message = "You must be signed in.") {
    super(message);
    this.name = "Unauthorised";
  }
}

/**
 * The current user's id, for use in queries.
 *
 * Throws rather than returning null: every caller below is a workspace read or
 * write, and continuing without a user would mean querying across all
 * accounts. Server actions are reachable by direct POST, so this is the check
 * that actually stops a signed-out or forged request from touching data.
 */
export async function requireOwnerId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Unauthorised();
  return user.id;
}

/**
 * The ownership filter.
 *
 * Returns `{ ownerId }` — narrow enough to combine with any other criteria via
 * `$and` or object spread.
 */
export function ownerFilter(ownerId: string): Filter<Document> {
  return { ownerId };
}

/**
 * Merge ownership into an existing Mongo filter.
 *
 * Spread is used rather than `$and` because the existing filters never set
 * `ownerId`, so there is no key to collide with — and a top-level equality is
 * easier for the query planner than a nested `$and`.
 */
export function scoped<T extends Document>(ownerId: string, filter: Filter<T> = {}): Filter<T> {
  return { ...filter, ownerId } as Filter<T>;
}

/* ------------------------------------------------------------------
   Legacy data.

   Documents created before ownership existed have no `ownerId`. They cannot be
   left visible to everyone, and silently deleting them would destroy real
   work. Instead they are claimed once by the first account that signs in —
   below, in `claimOrphanDocuments`.
   ------------------------------------------------------------------ */

/** Filter matching documents that predate ownership. */
export function orphanFilter(): Filter<Document> {
  return { ownerId: { $exists: false } } as Filter<Document>;
}

/** Collections that hold per-user workspace data. */
export const OWNED_COLLECTIONS = [
  "jobs",
  "quotes",
  "changeOrders",
  "invoices",
] as const;

export type OwnedCollection = (typeof OWNED_COLLECTIONS)[number];
