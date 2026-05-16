import Link from "next/link";

export function SignUpInButtons() {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Link
        href="/sign-up"
        className="flex-1 border border-yellow bg-yellow px-6 py-3 text-center text-sm font-bold uppercase tracking-widest text-black transition hover:opacity-90"
      >
        [ SKAPA KONTO ]
      </Link>
      <Link
        href="/sign-in"
        className="flex-1 border border-border px-6 py-3 text-center text-sm font-bold uppercase tracking-widest text-foreground transition hover:border-cyan hover:text-cyan"
      >
        [ LOGGA IN ]
      </Link>
    </div>
  );
}
