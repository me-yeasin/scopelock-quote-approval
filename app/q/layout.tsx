import type { ReactNode } from "react";

/* ------------------------------------------------------------------
   Layout for the public quote page.

   The dashboard shell locks the document (`height: 100vh;
   overflow: hidden`) so its own panels scroll internally. A customer
   page must scroll normally, and must not inherit that frame, so this
   layout opts the public routes out of it and lets the card own the
   page height instead.
   ------------------------------------------------------------------ */

export default function CustomerLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Scoped override: only public quote pages unlock the document. */}
      <style>{`
        html:has(.cq), body:has(.cq) {
          height: auto;
          min-height: 100%;
          padding: 0;
          overflow: visible;
          background: var(--paper);
        }
      `}</style>
      {children}
    </>
  );
}
