import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { buildHets } from "@/lib/banter";
import { getH2HSquads, getLeaderboard } from "@/lib/leaderboard";
import { RIVALRY_LINKS } from "@/lib/rivalries";
import { HetsClient } from "./hets-client";
import { demoLeaderboardRows } from "./demo-data";
import { ACCENT_TEXT } from "./rivalry-ui";

export const revalidate = 300;

export const metadata = {
  title: "HETS — Copa del Mundo 2026",
  description:
    "Text-TV-sidan där lagen ställs mot väggen. Sida 1 grädda, sida 2 mellanmjölk, sida 3 skämsvrå.",
};

export default async function HetsPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  // Dev-only preview with fake standings so the page can be evaluated before
  // any real round is scored. Never runs in production — reads no real data.
  const { demo } = await searchParams;
  if (demo && process.env.NODE_ENV !== "production") {
    return (
      <Shell>
        <p className="mb-3 border border-magenta/40 bg-magenta/5 px-3 py-1.5 text-[10px] uppercase tracking-widest text-magenta">
          ▌ DEMOLÄGE · FEJKAD DATA · SYNS BARA I DEV
        </p>
        <HetsClient pages={buildHets(demoLeaderboardRows())} squads={{}} anyScored />
      </Shell>
    );
  }

  const [lb, squads] = await Promise.all([
    getLeaderboard().catch(() => null),
    getH2HSquads().catch(() => ({})),
  ]);

  if (!lb || lb.rows.length === 0) {
    return (
      <Shell>
        <p className="mt-8 border border-yellow/30 bg-yellow/5 p-4 text-sm text-dim">
          {lb ? "Inga lag ännu — ingen att håna." : "Underhåll pågår — försök igen om en stund."}
        </p>
      </Shell>
    );
  }

  const pages = buildHets(lb.rows);

  return (
    <Shell>
      {!lb.anyScored && (
        <p className="mb-3 border border-cyan/40 bg-cyan/5 px-3 py-1.5 text-[10px] uppercase tracking-widest text-cyan">
          ▌ INGEN ROND POÄNGSATT ÄNNU · RANKAS PÅ LAGVÄRDE (SQUAD + BANK) JUST NU
        </p>
      )}
      <HetsClient pages={pages} squads={squads} anyScored={lb.anyScored} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <Breadcrumbs trail={[{ label: "HETS" }]} />
        <section className="py-6">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-yellow sm:text-3xl">
            HETSEN
          </h1>
          <p className="mt-2 text-sm text-dim">
            Åååhhh nej det är jobbigt o hamna på sida 3...
          </p>
        </section>
        <RivalryNav />
        {children}
        <p className="mt-10 text-center text-[10px] uppercase tracking-widest text-dim">
          ──── COPA TEXT · EOF ────
        </p>
      </div>
    </main>
  );
}

function RivalryNav() {
  return (
    <nav className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 border-y border-border py-2 text-xs">
      {RIVALRY_LINKS.map((r, i) => (
        <span key={r.slug} className="flex items-center gap-3">
          {i > 0 && <span className="text-dim">|</span>}
          <Link
            href={`/hets/${r.slug}`}
            className={`${ACCENT_TEXT[r.accent]} hover:underline`}
          >
            {r.title}
          </Link>
        </span>
      ))}
    </nav>
  );
}
