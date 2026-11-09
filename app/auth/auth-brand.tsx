import Link from "next/link";
import { Check, Lock } from "lucide-react";

/* ------------------------------------------------------------------
   The shared left-hand panel for both auth screens.

   Same markup on login and sign-up, so the two pages feel like one door
   rather than two different products.
   ------------------------------------------------------------------ */

export default function AuthBrand({
  heading,
  lede,
  points,
}: {
  heading: React.ReactNode;
  lede: string;
  points: string[];
}) {
  return (
    <aside className="auth-brand">
      <div className="auth-brand-inner">
        <Link href="/" className="auth-logo">
          <span className="auth-logo-mark" aria-hidden="true">
            <Lock className="ico ico-sm" />
          </span>
          ScopeLock
        </Link>

        <div className="auth-brand-copy">
          <h1>{heading}</h1>
          <p>{lede}</p>

          <ul className="auth-points">
            {points.map((point) => (
              <li key={point}>
                <Check className="ico ico-xs" aria-hidden="true" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="auth-brand-foot">Quote · Agree · Prove · Invoice</p>
      </div>
    </aside>
  );
}
