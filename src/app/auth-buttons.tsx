"use client";

import { SignInButton, SignUpButton } from "@clerk/nextjs";

const signUpClass =
  "flex-1 border border-yellow bg-yellow px-6 py-3 text-sm font-bold uppercase tracking-widest text-black transition hover:opacity-90";
const signInClass =
  "flex-1 border border-border px-6 py-3 text-sm font-bold uppercase tracking-widest text-foreground transition hover:border-cyan hover:text-cyan";

export function SignUpInButtons() {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      {/* Same-line child to avoid React.Children.only tripping on JSX whitespace */}
      <SignUpButton mode="modal" fallbackRedirectUrl="/app"><button type="button" className={signUpClass}>[ SKAPA KONTO ]</button></SignUpButton>
      <SignInButton mode="modal" fallbackRedirectUrl="/app"><button type="button" className={signInClass}>[ LOGGA IN ]</button></SignInButton>
    </div>
  );
}
