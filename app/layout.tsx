import type { Metadata } from "next";
import { Suspense } from "react";
import { Instrument_Serif, Inter_Tight } from "next/font/google";
import KeyedChildren from "./keyed-children";

import "./globals.css";

const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ScopeLock — Overview",
  description: "Quote, change order and invoice workspace for trades.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${interTight.variable} ${instrumentSerif.variable}`}
    >
      <body>
        {/*
          KeyedChildren reads usePathname(), which suspends on routes whose
          dynamic params are unknown at build time (e.g. the public
          /q/[token] quote page). The boundary keeps every other route
          prerenderable instead of failing the build.
        */}
        <Suspense fallback={children}>
          <KeyedChildren>{children}</KeyedChildren>
        </Suspense>
      </body>
    </html>
  );
}
