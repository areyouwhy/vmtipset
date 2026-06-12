import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import type { RivalryAccent } from "@/lib/rivalries";

export const ACCENT_TEXT: Record<RivalryAccent, string> = {
  cyan: "text-cyan",
  yellow: "text-yellow",
  green: "text-green",
  red: "text-red",
  magenta: "text-magenta",
};

export const ACCENT_BORDER: Record<RivalryAccent, string> = {
  cyan: "border-cyan/40",
  yellow: "border-yellow/40",
  green: "border-green/40",
  red: "border-red/40",
  magenta: "border-magenta/40",
};

export const ACCENT_BG: Record<RivalryAccent, string> = {
  cyan: "bg-cyan/5",
  yellow: "bg-yellow/5",
  green: "bg-green/5",
  red: "bg-red/5",
  magenta: "bg-magenta/5",
};

/** Page wrapper matching the /hets aesthetic, with a HETS breadcrumb. */
export function RivalryShell({
  title,
  tagline,
  children,
}: {
  title: string;
  tagline: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <Breadcrumbs
          trail={[{ label: "HETS", href: "/hets" }, { label: title }]}
        />
        <section className="py-6">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-yellow sm:text-3xl">
            {title}
          </h1>
          <p className="mt-2 text-sm text-dim">{tagline}</p>
        </section>
        {children}
        <p className="mt-10 text-center text-[10px] uppercase tracking-widest text-dim">
          <Link href="/hets" className="text-cyan">
            ‹ TILLBAKA TILL HETS
          </Link>
        </p>
      </div>
    </main>
  );
}

/**
 * Phase-2 placeholder. Voting will be Clerk-authed and stored in an isolated
 * table; until then this just teases it so the layout slot exists.
 */
export function VoteTeaser({
  aLabel,
  bLabel,
}: {
  aLabel: string;
  bLabel: string;
}) {
  return (
    <section className="mt-6 border border-magenta/40 bg-magenta/5">
      <header className="border-b border-magenta/40 px-3 py-2 text-[10px] uppercase tracking-widest text-magenta">
        VEM VINNER? · RÖSTNING
      </header>
      <div className="grid grid-cols-2 gap-2 p-3">
        {[aLabel, bLabel].map((label) => (
          <button
            key={label}
            type="button"
            disabled
            className="cursor-not-allowed border border-border px-3 py-3 text-center text-xs uppercase tracking-widest text-dim/70"
          >
            {label}
          </button>
        ))}
      </div>
      <p className="border-t border-border px-3 py-2 text-[10px] uppercase tracking-widest text-dim">
        ⧗ Röstning öppnar snart — då loggar du in och lägger din röst.
      </p>
    </section>
  );
}
