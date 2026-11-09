"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Building2,
  CircleAlert,
  Eye,
  EyeOff,
  Lock,
  Mail,
  User,
} from "lucide-react";

import { signUpAction } from "./actions";
import {
  isEmailShape,
  normaliseEmail,
  passwordStrength,
  LIMITS,
} from "../../lib/auth-shared";

/* ------------------------------------------------------------------
   Sign-up form.

   Two password fields because a typo in a masked field locks the user out of
   an account that was just created — there is no password reset yet, so the
   confirmation is essential rather than a nicety.
   ------------------------------------------------------------------ */

export default function SignUpForm() {
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailTouched, setEmailTouched] = useState(false);
  const [pending, startTransition] = useTransition();

  const strength = passwordStrength(password);
  const emailBad = emailTouched && email.length > 0 && !isEmailShape(email);
  const confirmBad = confirm.length > 0 && confirm !== password;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Those passwords do not match.");
      document.getElementById("signup-error")?.focus();
      return;
    }

    const formData = new FormData();
    formData.set("name", name);
    formData.set("companyName", companyName);
    formData.set("email", normaliseEmail(email));
    formData.set("password", password);

    startTransition(async () => {
      const result = await signUpAction(formData);
      if (!result.ok) {
        setError(result.error);
        document.getElementById("signup-error")?.focus();
      }
    });
  }

  return (
    <>
      <div className="auth-head">
        <h2>Create your workspace</h2>
        <p>Set up your account and start quoting in a minute.</p>
      </div>

      <form className="auth-form" onSubmit={onSubmit} noValidate>
        {error ? (
          <div className="auth-alert" id="signup-error" role="alert" tabIndex={-1}>
            <CircleAlert className="ico ico-sm" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="auth-row two">
          <div className="auth-field">
            <label className="auth-label" htmlFor="name">
              Your name
            </label>
            <div className="auth-input-wrap">
              <User className="ico ico-sm" aria-hidden="true" />
              <input
                id="name"
                name="name"
                type="text"
                className="auth-input has-icon"
                autoComplete="name"
                placeholder="Alex Fletcher"
                maxLength={LIMITS.name}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                autoFocus
              />
            </div>
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="companyName">
              Company
            </label>
            <div className="auth-input-wrap">
              <Building2 className="ico ico-sm" aria-hidden="true" />
              <input
                id="companyName"
                name="companyName"
                type="text"
                className="auth-input has-icon"
                autoComplete="organization"
                placeholder="Fletcher Plumbing"
                maxLength={LIMITS.companyName}
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                required
              />
            </div>
          </div>
        </div>

        <div className="auth-field">
          <label className="auth-label" htmlFor="email">
            Email
          </label>
          <div className="auth-input-wrap">
            <Mail className="ico ico-sm" aria-hidden="true" />
            <input
              id="email"
              name="email"
              type="email"
              className="auth-input has-icon"
              autoComplete="email"
              inputMode="email"
              placeholder="you@company.co.uk"
              maxLength={LIMITS.email}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onBlur={() => setEmailTouched(true)}
              aria-invalid={emailBad}
              required
            />
          </div>
          {emailBad ? (
            <span className="auth-error">
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
              autoComplete="new-password"
              placeholder={`At least ${LIMITS.password.min} characters`}
              maxLength={LIMITS.password.max}
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

          {password.length > 0 ? (
            <div className="auth-meter">
              <span className="auth-meter-track" aria-hidden="true">
                {[1, 2, 3].map((segment) => (
                  <span
                    key={segment}
                    className={`auth-meter-seg${
                      strength.score >= segment ? ` on-${strength.score}` : ""
                    }`}
                  />
                ))}
              </span>
              <span className="auth-meter-label" aria-live="polite">
                {strength.label}
              </span>
            </div>
          ) : (
            <span className="auth-hint">Use a phrase you will remember.</span>
          )}
        </div>

        <div className="auth-field">
          <label className="auth-label" htmlFor="confirm">
            Confirm password
          </label>
          <div className="auth-input-wrap">
            <Lock className="ico ico-sm" aria-hidden="true" />
            <input
              id="confirm"
              name="confirm"
              type={showPassword ? "text" : "password"}
              className="auth-input has-icon"
              autoComplete="new-password"
              placeholder="Type it again"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              aria-invalid={confirmBad}
              required
            />
          </div>
          {confirmBad ? (
            <span className="auth-error">
              <CircleAlert className="ico ico-xs" aria-hidden="true" />
              Those passwords do not match.
            </span>
          ) : null}
        </div>

        <button className="auth-submit" type="submit" disabled={pending}>
          {pending ? (
            <>
              <span className="auth-spinner" aria-hidden="true" />
              Creating account…
            </>
          ) : (
            "Create account"
          )}
        </button>
      </form>

      <p className="auth-switch">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </>
  );
}
