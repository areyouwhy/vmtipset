"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Root-level error boundary. Catches anything thrown during render of a
 * route segment that doesn't have a closer error.tsx — usually a database
 * outage (e.g. Neon refusing queries past a quota). Public pages already
 * have explicit .catch fallbacks; this boundary covers the authenticated
 * surface (/app, /admin, /team/[slug]) where degrading is harder.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[route error]", error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="mx-auto w-full max-w-xl border border-yellow/40 bg-yellow/5 p-6">
        <p className="text-xs uppercase tracking-widest text-yellow">
          UNDERHÅLL PÅGÅR
        </p>
        <h1 className="mt-3 text-2xl font-bold uppercase tracking-tight text-foreground">
          Vi jobbar på det
        </h1>
        <p className="mt-3 text-sm text-dim">
          Sidan är tillfälligt nere för underhåll. Försök igen om en stund.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 text-xs">
          <button
            type="button"
            onClick={reset}
            className="border border-yellow bg-yellow px-4 py-2 font-bold uppercase tracking-widest text-black hover:opacity-90"
          >
            [ FÖRSÖK IGEN ]
          </button>
          <Link
            href="/"
            className="border border-border px-4 py-2 font-bold uppercase tracking-widest text-foreground hover:border-cyan hover:text-cyan"
          >
            [ TILL FÖRSTASIDAN ]
          </Link>
        </div>
      </div>
    </main>
  );
}
