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
