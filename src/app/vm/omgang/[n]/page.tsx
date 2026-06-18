import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { WcMatchLine } from "@/components/wc-match-line";
import {
  getAllMatches,
  getMatchGroups,
  getTeamLookup,
  type WcMatchGroup,
} from "@/lib/wc-tournament";
import { getRoundStats, type RoundStats } from "@/lib/round-stats-data";
import { RoundStatsLineup } from "./round-stats-lineup";

export const revalidate = 600;

const ROUND_TITLES: Record<number, string> = {
  1: "GRUPPSPEL · OMGÅNG 1",
  2: "GRUPPSPEL · OMGÅNG 2",
  3: "GRUPPSPEL · OMGÅNG 3",
  4: "SLUTSPEL · SEXTONDELSFINAL",
  5: "SLUTSPEL · ÅTTONDELSFINAL",
  6: "SLUTSPEL · KVARTSFINAL",
  7: "SLUTSPEL · SEMIFINAL & BRONS",
  8: "SLUTSPEL · FINAL",
};

const KNOCKOUT_ROUND = (n: number) => n >= 4;

export default async function OmgangPage({
  params,
}: {
  params: Promise<{ n: string }>;
}) {
  const { n: nStr } = await params;
  const n = Number.parseInt(nStr, 10);
  if (!Number.isFinite(n) || n < 1 || n > 8) notFound();

  const [allMatches, mgsById, teamsById, roundStats] = await Promise.all([
    getAllMatches(),
    getMatchGroups(),
    getTeamLookup(),
    getRoundStats(n).catch(() => null),
  ]);
  const matches = allMatches
    .filter((m) => m.roundNumber === n)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));

  // Bucket by matchGroup (Group A, Last 32, etc.) so each section gets its
  // own header. Sort group sections alphabetically by name.
  const byGroup = new Map<number, typeof matches>();
  for (const m of matches) {
    const arr = byGroup.get(m.matchGroupId) ?? [];
    arr.push(m);
    byGroup.set(m.matchGroupId, arr);
  }
  const sections = [...byGroup.entries()]
    .map(([id, ms]) => ({ group: mgsById.get(id), matches: ms }))
    .filter((s): s is { group: WcMatchGroup; matches: typeof matches } => !!s.group)
    .sort((a, b) => a.group.name.localeCompare(b.group.name));

  const isKnockout = KNOCKOUT_ROUND(n);
  const parentLabel = isKnockout ? "SLUTSPEL" : "GRUPPSPEL";
  const parentHref = isKnockout ? "/vm/slutspel" : "/vm/gruppspel";

  const prevN = n > 1 ? n - 1 : null;
  const nextN = n < 8 ? n + 1 : null;

  // A played round (stats available) leads with the stats and tucks the
  // fixtures into an accordion below — once it's over, who-picked-what + the
  // results matter more than the schedule.
  const passed = roundStats?.available === true;

  const matchesInner = (
    <>
      {sections.length === 0 && (
        <p className="border border-dashed border-border p-3 text-xs text-dim">
          — inga matcher i denna omgång ännu —
        </p>
      )}
      {sections.map(({ group, matches: ms }) => {
        const letterMatch = group.name.match(/([A-Z])\s*$/);
        const letter = letterMatch?.[1] ?? null;
        return (
          <section key={group.externalId}>
            <h2 className="border-b border-border pb-1 text-[10px] uppercase tracking-widest text-cyan">
              {letter && !isKnockout ? (
                <Link
                  href={`/vm/gruppspel#grupp-${letter}`}
                  className="hover:text-yellow"
                >
                  {group.name}
                </Link>
              ) : (
                group.name
              )}
              <span className="ml-2 text-dim">{ms.length}</span>
            </h2>
            <ul className="divide-y divide-border/40">
              {ms.map((m) => (
                <WcMatchLine key={m.externalId} m={m} teamsById={teamsById} />
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );

  const statsSection = (
    <section>
      <h2 className="border-b border-border pb-1 text-[10px] uppercase tracking-widest text-cyan">
        RONDSTATISTIK
      </h2>
      {!roundStats || !roundStats.available ? (
        <p className="mt-3 border border-dashed border-border p-3 text-xs text-dim">
          — statistik visas när ronden har spelats —
        </p>
      ) : (
        <div className="mt-3 space-y-4">
          <RoundStatsSummary stats={roundStats.stats} />
          <RoundStatsLineup lineups={roundStats.lineups} />
        </div>
      )}
    </section>
  );

  const matchesAccordion = (
    <details className="group border border-border">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[10px] uppercase tracking-widest marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="text-cyan">MATCHER · {matches.length}</span>
        <span className="text-dim transition-transform group-open:rotate-90">
          ▸
        </span>
      </summary>
      <div className="space-y-5 border-t border-border p-3">{matchesInner}</div>
    </details>
  );

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <Breadcrumbs
          trail={[
            { label: "VM", href: "/vm" },
            { label: parentLabel, href: parentHref },
            { label: `OMGÅNG ${n}` },
          ]}
        />

        <section className="py-6">
          <p className="text-[10px] uppercase tracking-widest text-dim">
            OMGÅNG {n}
          </p>
          <h1 className="mt-1 text-2xl font-bold uppercase tracking-tight text-yellow">
            {ROUND_TITLES[n] ?? `OMGÅNG ${n}`}
          </h1>
          <p className="mt-2 text-sm text-dim">
            {matches.length} matcher.
          </p>
        </section>

        <nav className="mb-4 flex items-center justify-between border-y border-border py-2 text-[10px] uppercase tracking-widest">
          {prevN ? (
            <Link
              href={`/vm/omgang/${prevN}`}
              className="text-cyan hover:text-yellow"
            >
              ← OMGÅNG {prevN}
            </Link>
          ) : (
            <span className="text-dim">—</span>
          )}
          <span className="text-dim">{n} / 8</span>
          {nextN ? (
            <Link
              href={`/vm/omgang/${nextN}`}
              className="text-cyan hover:text-yellow"
            >
              OMGÅNG {nextN} →
            </Link>
          ) : (
            <span className="text-dim">—</span>
          )}
        </nav>

        {passed ? (
          <div className="space-y-8">
            {statsSection}
            {matchesAccordion}
          </div>
        ) : (
          <div className="space-y-8">
            <div className="space-y-5">{matchesInner}</div>
            {statsSection}
          </div>
        )}
      </div>
    </main>
  );
}

function fmtSek(n: number): string {
  if (n === 0) return "0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k`;
  return `${sign}${abs}`;
}

function growthLabel(n: number): string {
  const arrow = n > 0 ? "↑" : n < 0 ? "↓" : "";
  return `${arrow}${fmtSek(n)}`;
}

function RoundStatsSummary({ stats }: { stats: RoundStats }) {
  const cells: { label: string; value: string; sub?: string; tone?: string }[] = [];
  if (stats.topPlayer)
    cells.push({
      label: "POPULÄRAST",
      value: stats.topPlayer.player.name,
      sub: `${stats.topPlayer.count} lag`,
    });
  if (stats.topCaptain)
    cells.push({
      label: "POPULÄRAST © KAPTEN",
      value: stats.topCaptain.player.name,
      sub: `${stats.topCaptain.count} lag`,
    });
  if (stats.topCountry)
    cells.push({
      label: "POPULÄRAST LAND",
      value: stats.topCountry.name,
      sub: `${stats.topCountry.count} val`,
    });
  if (stats.bestPick)
    cells.push({
      label: "BÄSTA VALET",
      value: stats.bestPick.name,
      sub: growthLabel(stats.bestPick.growthSek),
      tone: "text-green",
    });
  if (stats.worstPick)
    cells.push({
      label: "SÄMSTA VALET",
      value: stats.worstPick.name,
      sub: growthLabel(stats.worstPick.growthSek),
      tone: "text-red",
    });
  if (stats.bestCaptainPick)
    cells.push({
      label: "BÄSTA © KAPTENVALET",
      value: stats.bestCaptainPick.player.name,
      sub: `${growthLabel(stats.bestCaptainPick.player.growthSek)} · ${stats.bestCaptainPick.count} lag`,
      tone: "text-green",
    });

  if (cells.length === 0) {
    return (
      <p className="text-xs text-dim">— inga lagval denna rond —</p>
    );
  }

  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {cells.map((c) => (
        <div key={c.label} className="border border-border p-2">
          <dt className="text-[9px] uppercase tracking-widest text-dim">
            {c.label}
          </dt>
          <dd className="mt-0.5 truncate text-sm text-foreground" title={c.value}>
            {c.value}
          </dd>
          {c.sub && (
            <dd className={`text-[10px] tabular-nums ${c.tone ?? "text-dim"}`}>
              {c.sub}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}
