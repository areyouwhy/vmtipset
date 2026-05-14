"use client";

import { useClerk } from "@clerk/nextjs";

export function SignUpInButtons() {
  const { openSignIn, openSignUp } = useClerk();
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <button
        type="button"
        onClick={() => openSignUp({ fallbackRedirectUrl: "/app" })}
        className="flex-1 border border-yellow bg-yellow px-6 py-3 text-sm font-bold uppercase tracking-widest text-black transition hover:opacity-90"
      >
        [ SKAPA KONTO ]
      </button>
      <button
        type="button"
        onClick={() => openSignIn({ fallbackRedirectUrl: "/app" })}
        className="flex-1 border border-border px-6 py-3 text-sm font-bold uppercase tracking-widest text-foreground transition hover:border-cyan hover:text-cyan"
      >
        [ LOGGA IN ]
      </button>
    </div>
  );
}
