import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";

import AuthBrand from "../auth/auth-brand";
import SignUpForm from "../auth/signup-form";
import { getCurrentUser } from "@/lib/auth";
import "../auth/auth.css";

/* Reads the session cookie to bounce signed-in users; nothing to prerender. */
export const instant = false;

export const metadata: Metadata = {
  title: "Create an account — ScopeLock",
  description: "Create your ScopeLock workspace.",
};

export default async function SignUpPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <div className="auth-page">
      <AuthBrand
        heading={
          <>
            Set up once. <em>Get paid</em> for all of it.
          </>
        }
        lede="One workspace for the whole job — from the first quote to the final invoice, with a written record of every change in between."
        points={[
          "No card required to start",
          "Your jobs stay private to your company",
          "Works on a phone in a customer's hallway",
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

          <SignUpForm />
        </div>
      </main>
    </div>
  );
}
