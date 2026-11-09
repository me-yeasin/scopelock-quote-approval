import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";

import AuthBrand from "../auth/auth-brand";
import LoginForm from "../auth/login-form";
import { getCurrentUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/auth-shared";
import "../auth/auth.css";

/*
  These routes are inherently per-request: they read the session cookie to
  bounce already-signed-in users, and the login form reads `?next=`. There is
  nothing to prerender, so state that explicitly instead of wrapping the whole
  page in Suspense for no user-visible benefit.
*/
export const instant = false;

export const metadata: Metadata = {
  title: "Sign in — ScopeLock",
  description: "Sign in to your ScopeLock workspace.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Someone already signed in has no business on the login screen.
  const user = await getCurrentUser();
  if (user) redirect("/");

  /*
    `searchParams` is a Promise in this version of Next.js.
  */
  const params = await searchParams;
  const raw = params?.next;
  const next = safeNextPath(Array.isArray(raw) ? raw[0] : raw);

  return (
    <div className="auth-page">
      <AuthBrand
        heading={
          <>
            Every extra, <em>agreed</em> before it costs you.
          </>
        }
        lede="ScopeLock keeps the quote, the change orders and the invoice in one straight line — so unbilled work stops slipping through."
        points={[
          "Quotes the customer can approve on their phone",
          "Change orders that record the agreement, not a text message",
          "Invoices that match what was actually agreed",
        ]}
      />

      <main className="auth-main">
        <div className="auth-card">
          <Link href="/" className="auth-mobile-logo">
            <span className="auth-logo-mark" aria-hidden="true">
              <Lock className="ico ico-sm" />
            </span>
            ScopeLock
          </Link>

          <LoginForm next={next} />
        </div>
      </main>
    </div>
  );
}
