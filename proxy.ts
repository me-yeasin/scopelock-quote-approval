import { NextResponse, type NextRequest } from "next/server";

/* ------------------------------------------------------------------
   The security wall.

   Runs before every matched request. This is an *optimistic* check only: it
   looks for the presence of a session cookie and nothing more.

   Why not validate the session here: the proxy runs on every navigation and
   must stay fast. A database round-trip per static asset request would be
   wasteful, and the docs are explicit that the proxy must not become the
   authorisation layer. Presence of a cookie is enough to decide "bounce this
   visitor to the login page"; every page and server action re-checks the
   session against the database, which is what actually protects data.

   A forged cookie therefore gets past this file and is then rejected by
   `requireUser()` — the page redirects back here. Defence in depth, with the
   real gate in the data layer.
   ------------------------------------------------------------------ */

const SESSION_COOKIE = "sl_session";

/** Pages that must stay reachable while signed out. */
const PUBLIC_PREFIXES = ["/login", "/signup"];

/**
 * Token pages are shared with customers, who have no account and never will.
 * They must remain open or the product stops working for the tradesperson's
 * clients — so they are excluded from the wall, and their security is the
 * unguessable token itself.
 */
function isPublic(pathname: string) {
  if (PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return true;
  }
  if (pathname.startsWith("/q/") || pathname.startsWith("/c/") || pathname.startsWith("/i/")) {
    return true;
  }
  return false;
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const looksSignedIn = typeof token === "string" && token.length > 20;

  if (!looksSignedIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";

    // Remember where they were headed so login can return them there.
    // Only the path and query are kept — never a full URL, which would make
    // the redirect target attacker-controlled.
    if (pathname !== "/") {
      url.searchParams.set("next", `${pathname}${search}`);
    }

    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Everything except static assets, app icons and the web manifest. Excluding
   * them keeps the wall off the hot path for CSS, JS and images — and, for the
   * manifest, keeps it fetchable by browsers while signed out. (Icons are
   * covered by the `svg|png|ico` list; the manifest is a `.webmanifest`, which
   * is why it is named explicitly.)
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};
