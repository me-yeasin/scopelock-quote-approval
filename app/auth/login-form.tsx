"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CircleAlert, Eye, EyeOff, Lock } from "lucide-react";

import { signInAction } from "./actions";
import { isEmailShape, normaliseEmail } from "../../lib/auth-shared";

/* ------------------------------------------------------------------
   Sign-in form.

   Validates shape on blur so a typo is caught before submitting, but the
   submit button is never disabled on validity — a disabled button that gives
   no reason is one of the most common login frustrations, and the server
   returns a clear message anyway.
   ------------------------------------------------------------------ */

export default function LoginForm({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailTouched, setEmailTouched] = useState(false);
  const [pending, startTransition] = useTransition();

  const emailBad = emailTouched && email.length > 0 && !isEmailShape(email);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("email", normaliseEmail(email));
    formData.set("password", password);

    startTransition(async () => {
      // The action redirects on success, so it only ever returns on failure.
      const result = await signInAction(formData, next);
      if (!result.ok) {
        setError(result.error);
        // Send focus to the error so screen readers announce it and keyboard
        // users are not stranded at the bottom of the form.
        document.getElementById("login-error")?.focus();
      }
    });
  }

  return (
    <>
      <div className="auth-head">
        <h2>Welcome back</h2>
        <p>Sign in to pick up where you left off.</p>
      </div>

      <form className="auth-form" onSubmit={onSubmit} noValidate>
        {error ? (
          <div className="auth-alert" id="login-error" role="alert" tabIndex={-1}>
            <CircleAlert className="ico ico-sm" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="auth-field">
          <label className="auth-label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            className="auth-input"
            autoComplete="email"
            inputMode="email"
            placeholder="you@company.co.uk"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onBlur={() => setEmailTouched(true)}
            aria-invalid={emailBad}
            aria-describedby={emailBad ? "email-hint" : undefined}
            required
            autoFocus
          />
          {emailBad ? (
            <span className="auth-error" id="email-hint">
              <CircleAlert className="ico ico-xs" aria-hidden="true" />
              That does not look like an email address.
            </span>
          ) : null}
        </div>

        <div className="auth-field">
          <label className="auth-label" htmlFor="password">
            Password
          </label>
          <div className="auth-input-wrap">
            <Lock className="ico ico-sm" aria-hidden="true" />
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              className="auth-input has-icon"
              autoComplete="current-password"
              placeholder="Your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              style={{ paddingRight: 44 }}
              required
            />
            <button
              type="button"
              className="auth-toggle"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
            >
              {showPassword ? (
                <EyeOff className="ico ico-sm" aria-hidden="true" />
              ) : (
                <Eye className="ico ico-sm" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        <button className="auth-submit" type="submit" disabled={pending}>
          {pending ? (
            <>
              <span className="auth-spinner" aria-hidden="true" />
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </button>
      </form>

      <p className="auth-switch">
        New to ScopeLock? <Link href="/signup">Create an account</Link>
      </p>
    </>
  );
}
