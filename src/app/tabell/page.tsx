import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { buildHets } from "@/lib/banter";
import { getH2HSquads, getLeaderboard } from "@/lib/leaderboard";
import { SectionNav } from "@/components/section-nav";
import { RIVALRY_LINKS } from "@/lib/rivalries";
import { teamSlug } from "@/lib/team-slug";
import { getLiveView, type LiveView } from "@/lib/live-exposure-data";
import type { TeamDailyAggregate } from "@/lib/live-exposure";
import { HetsClient } from "../hets/hets-client";
import { demoLeaderboardRows } from "../hets/demo-data";
import { ACCENT_TEXT } from "../hets/rivalry-ui";

export const revalidate = 300;

export const metadata = {
  title: "TABELL — Copa del Mundo 2026",
  description:
    "Ligatabellen som Text-TV: grädda, mellanmjölk, skämsvrå — plus head-2-head mellan två lag.",
};

export default async function TabellPage({
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

  const [lb, squads, live] = await Promise.all([
    getLeaderboard().catch(() => null),
    getH2HSquads().catch(() => ({})),
    getLiveView().catch(() => null),
  ]);

  if (!lb || lb.rows.length === 0) {
    return (
      <Shell top={<LiveHighlight live={live} />}>
        <p className="mt-8 border border-yellow/30 bg-yellow/5 p-4 text-sm text-dim">
          {lb
            ? "Inga lag ännu."
            : "Underhåll pågår — försök igen om en stund."}
        </p>
      </Shell>
    );
  }

  const pages = buildHets(lb.rows);

  return (
    <Shell top={<LiveHighlight live={live} />}>
      {!lb.anyScored && (
        <p className="mb-3 border border-cyan/40 bg-cyan/5 px-3 py-1.5 text-[10px] uppercase tracking-widest text-cyan">
          ▌ INGEN ROND POÄNGSATT ÄNNU · RANKAS PÅ LAGVÄRDE (SQUAD + BANK) JUST NU
        </p>
      )}
      <HetsClient pages={pages} squads={squads} anyScored={lb.anyScored} />

      {lb.dailyBets.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xs uppercase tracking-widest text-yellow">
            DAGENS BET — POOL
          </h2>
          <p className="mt-1 text-xs text-dim">
            Egen pott. Endast lag som vunnit poäng visas.
          </p>
          <table className="mt-3 w-full border border-border text-sm tabular-nums">
            <tbody className="divide-y divide-border">
              {lb.dailyBets.map((row) => (
                <tr key={row.teamId}>
                  <td className="px-2 py-1.5 text-right text-yellow w-10">
                    {String(row.rank).padStart(2, "0")}
                  </td>
                  <td className="px-2 py-1.5">
                    <Link
                      href={`/team/${teamSlug(row.teamName)}`}
                      className="block truncate text-foreground hover:text-cyan"
                    >
                      {row.teamName}
                    </Link>
                    <span className="block text-[10px] uppercase tracking-widest text-dim">
                      {row.ownerHandle}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right text-yellow">
                    {row.pointsTotal}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </Shell>
  );
}

function Shell({
  children,
  top,
}: {
  children: React.ReactNode;
  top?: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <Breadcrumbs trail={[{ label: "TABELL" }]} />
        <SectionNav current="tabell" />
        <section className="py-6">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-yellow sm:text-3xl">
            TABELL
          </h1>
          <p className="mt-2 text-sm text-dim">
            Ligatabellen som Text-TV. VÄRDE = SQUAD + BANK — vinnaren är den med
            högst lagvärde när VM är slut. Sida 1 grädda, sida 2 mellanmjölk,
            sida 3 skämsvrå. Längre ner: ställ två lag mot varandra.{" "}
            <Link href="/tabell/detalj" className="text-cyan">
              DETALJERAD TABELL →
            </Link>
          </p>
        </section>
        {top}
        <RivalryNav />
        {children}
        <p className="mt-10 text-center text-[10px] uppercase tracking-widest text-dim">
          ──── COPA TEXT · EOF ────
        </p>
      </div>
    </main>
  );
}

// SEK formatter mirroring the team-page convention (− for negative, k/M).
function fmtSek(n: number): string {
  if (n === 0) return "0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k`;
  return `${sign}${abs}`;
}

/** Highlight strip linking to /live, surfacing today's two standout teams. */
function LiveHighlight({ live }: { live: LiveView | null }) {
  const mostExposed: TeamDailyAggregate | null = live?.leaderboard[0] ?? null;
  const mostGrowth: TeamDailyAggregate | null =
    live?.leaderboard.reduce<TeamDailyAggregate | null>(
      (best, r) => (best === null || r.growthSek > best.growthSek ? r : best),
      null,
    ) ?? null;
  const showGrowth = mostGrowth !== null && mostGrowth.growthSek > 0;
  const matchCount = live?.matches.length ?? 0;

  return (
    <Link
      href="/live"
      className="mb-5 block border border-cyan/40 bg-cyan/5 px-3 py-2 transition hover:border-yellow"
    >
      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest">
        <span className="text-cyan">● LIVE · DAGENS MATCHER</span>
        <span className="text-dim">
          {matchCount > 0
            ? `${matchCount} ${matchCount === 1 ? "match" : "matcher"}`
            : "se schemat"}{" "}
          →
        </span>
      </div>
      {(mostExposed || showGrowth) && (
        <div className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-2">
          {mostExposed && (
            <p className="truncate text-dim">
              MEST EXPONERAD:{" "}
              <span className="text-foreground">{mostExposed.teamName}</span>{" "}
              <span className="text-dim">({mostExposed.playerCount} sp)</span>
            </p>
          )}
          {showGrowth && mostGrowth && (
            <p className="truncate text-dim">
              MEST TILLVÄXT:{" "}
              <span className="text-foreground">{mostGrowth.teamName}</span>{" "}
              <span className="text-green">(+{fmtSek(mostGrowth.growthSek)})</span>
            </p>
          )}
        </div>
      )}
    </Link>
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
