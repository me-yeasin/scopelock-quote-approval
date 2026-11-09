import type { Metadata } from "next";
import { LinkIcon } from "lucide-react";
import "../../q/[token]/customer-quote.css";

export const metadata: Metadata = {
  title: "Change not found — ScopeLock",
  robots: { index: false, follow: false },
};

/**
 * Shown for an unknown, malformed or rotated token.
 *
 * Deliberately says nothing about why the link failed: confirming that a
 * token "existed but expired" would tell a stranger their guess hit a real
 * change. A plain 404 is the honest answer for every case.
 */
export default function NotFound() {
  return (
    <main className="cq">
      <div className="cq-empty">
        <div className="cq-empty-inner">
          <span className="cq-empty-icon" aria-hidden="true">
            <LinkIcon size={20} strokeWidth={2.2} />
          </span>
          <h1>This change link isn&apos;t available</h1>
          <p>
            The link may have been replaced with a newer one, or it may have
            been mistyped. Ask your plumber to send the link again.
          </p>
        </div>
      </div>
    </main>
  );
}
