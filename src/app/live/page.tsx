import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Jersey } from "@/lib/jersey";
import { getLiveView, type LiveView } from "@/lib/live-exposure-data";
import type { MatchExposureView, NationExposure } from "@/lib/live-exposure";
import { ExposureLeaderboard } from "./exposure-leaderboard";

export const metadata = {
  title: "Live · La Copa del Mundo 2026",
  description: "Dagens matcher och vilka lag som är exponerade.",
};

// Kickoff clock is shown in Swedish local time (that's when you'd watch);
// the day grouping itself is the American match day (see live-exposure.ts).
function kickoffTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Stockholm",
  });
}

/** Human label for a match-day key ("YYYY-MM-DD"). The key is a pure calendar
 *  date, so format it in UTC to avoid any tz shift. */
function dayLabel(dateKey: string, opts?: { short?: boolean }): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  return d
    .toLocaleDateString("sv-SE", {
      weekday: opts?.short ? "short" : "long",
      day: "numeric",
      month: opts?.short ? "numeric" : "long",
      timeZone: "UTC",
    })
    .toUpperCase();
}

function matchSummary(mv: MatchExposureView): { teams: number; players: number } {
  const teamIds = new Set<string>();
  let players = 0;
  for (const n of [mv.home, mv.away]) {
    if (!n) continue;
    for (const t of n.teams) {
      teamIds.add(t.teamId);
      players += t.players.length;
    }
  }
  return { teams: teamIds.size, players };
}

export default async function LivePage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const { d } = await searchParams;
  const data = await getLiveView(d);

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <Breadcrumbs trail={[{ label: "LIVE" }]} />

        <section className="py-6">
          <p className="text-[10px] uppercase tracking-widest text-dim">
            MATCHDAG
          </p>
          <h1 className="mt-1 text-2xl font-bold uppercase tracking-tight text-yellow">
            {dayLabel(data.dateKey)}
            {data.isToday && (
              <span className="ml-2 align-middle text-[10px] tracking-widest text-cyan">
                I DAG
              </span>
            )}
          </h1>
          <p className="mt-2 text-sm text-dim">
            {data.matches.length > 0
              ? `${data.matches.length} ${
                  data.matches.length === 1 ? "match" : "matcher"
                }`
              : "Inga matcher denna dag."}
          </p>
          <p className="mt-1 text-[11px] text-dim">
            Vilka av våra lag som har spelare i omlopp — i spel eller på bänken
            hos ett landslag som spelar. Tider i svensk tid.
          </p>
        </section>

        <DayNav data={data} />

        {data.matches.length === 0 ? (
          <p className="mt-4 border border-dashed border-border p-4 text-xs text-dim">
            — inga matcher denna dag —
          </p>
        ) : (
          <>
            <div className="mt-4 space-y-2">
              {data.matches.map((mv) => (
                <MatchAccordion key={mv.match.externalId} mv={mv} />
              ))}
            </div>

            <ExposureLeaderboard
              heading={data.isToday ? "DAGENS EXPONERING" : "EXPONERING"}
              rows={data.leaderboard}
              allRevealed={data.allRevealed}
            />
          </>
        )}
      </div>
    </main>
  );
}

function DayNav({ data }: { data: LiveView }) {
  const prevHref = data.prevDay ? `/live?d=${data.prevDay}` : null;
  const nextHref = data.nextDay ? `/live?d=${data.nextDay}` : null;
  return (
    <nav className="flex items-center justify-between gap-2 border-y border-border py-2 text-[10px] uppercase tracking-widest">
      {prevHref ? (
        <Link href={prevHref} className="text-cyan hover:text-yellow">
          ← {dayLabel(data.prevDay!, { short: true })}
        </Link>
      ) : (
        <span className="text-dim">—</span>
      )}
      {data.isToday ? (
        <span className="text-dim">I DAG</span>
      ) : (
        <Link href="/live" className="text-yellow hover:underline">
          ↺ I DAG
        </Link>
      )}
      {nextHref ? (
        <Link href={nextHref} className="text-cyan hover:text-yellow">
          {dayLabel(data.nextDay!, { short: true })} →
        </Link>
      ) : (
        <span className="text-dim">—</span>
      )}
    </nav>
  );
}

function statusBadge(mv: MatchExposureView) {
  const m = mv.match;
  if (m.status === "ongoing") {
    return (
      <span className="text-cyan">
        LIVE {m.homeScore ?? 0}-{m.awayScore ?? 0}
      </span>
    );
  }
  if (m.status === "finished" && m.homeScore !== null) {
    return (
      <span className="text-green">
        {m.homeScore}-{m.awayScore}
      </span>
    );
  }
  return <span className="text-dim">{kickoffTime(m.kickoff)}</span>;
}

function MatchAccordion({ mv }: { mv: MatchExposureView }) {
  const { home, away } = mv;
  const { teams, players } = matchSummary(mv);
  // Open ongoing matches by default; collapse the rest.
  const defaultOpen = mv.match.status === "ongoing";

  const expandable = mv.revealed && teams > 0;

  return (
    <details open={defaultOpen} className="group border border-border">
      <summary className="group/sum flex cursor-pointer list-none flex-col gap-1 px-3 py-2 transition-colors hover:bg-cyan/5 marker:content-none [&::-webkit-details-marker]:hidden">
        {/* Fixture row */}
        <div className="grid grid-cols-[auto_1fr_auto_1fr] items-center gap-2 text-[11px]">
          <span className="text-cyan transition-transform group-open:rotate-90">
            ▸
          </span>
          <span className="flex items-center justify-end gap-1.5 truncate">
            {home && <span className="truncate">{home.name}</span>}
            {home && <Jersey code={home.code} size={16} />}
          </span>
          <span className="px-1 text-center text-[10px] uppercase tracking-widest tabular-nums">
            {statusBadge(mv)}
          </span>
          <span className="flex items-center gap-1.5 truncate">
            {away && <Jersey code={away.code} size={16} />}
            {away && <span className="truncate">{away.name}</span>}
          </span>
        </div>
        {/* Exposure summary + expand affordance (visible while collapsed) */}
        <div className="flex items-center justify-between gap-2 pl-[18px] text-[10px] tracking-widest">
          <span className="text-dim">
            {!mv.revealed ? (
              <span className="text-dim">🔒 LÅST TILLS RONDEN STÄNGER</span>
            ) : teams === 0 ? (
              <span>INGA ÄGDA SPELARE</span>
            ) : (
              <span>
                <span className="text-white">{teams}</span> LAG ·{" "}
                <span className="text-white">{players}</span> SPELARE
              </span>
            )}
          </span>
          {expandable && (
            <span className="shrink-0 border border-cyan/50 px-1.5 py-0.5 text-cyan transition group-hover/sum:border-yellow group-hover/sum:text-yellow">
              <span className="group-open:hidden">VISA LAG ▾</span>
              <span className="hidden group-open:inline">DÖLJ ▴</span>
            </span>
          )}
        </div>
      </summary>

      {/* Body */}
      {!mv.revealed ? (
        <p className="border-t border-border px-3 py-3 text-[11px] text-dim">
          Trupperna visas när ronden låser.
        </p>
      ) : (
        <div className="grid grid-cols-1 border-t border-border divide-y divide-border/40 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <NationColumn nation={home} />
          <NationColumn nation={away} />
        </div>
      )}
    </details>
  );
}

function NationColumn({ nation }: { nation: NationExposure | null }) {
  if (!nation) return <div className="px-3 py-2" />;
  return (
    <div className="px-3 py-2">
      <p className="mb-1 flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-cyan">
        <Jersey code={nation.code} size={12} />
        <Link href={`/landslag/${nation.code}`} className="hover:text-yellow">
          {nation.name}
        </Link>
      </p>
      {nation.teams.length === 0 ? (
        <p className="text-[11px] text-dim">— inga ägda spelare —</p>
      ) : (
        <ul className="space-y-1.5">
          {nation.teams.map((t) => (
            <li key={t.teamId} className="text-[11px]">
              <Link
                href={`/team/${t.teamSlug}`}
                className="text-yellow hover:underline"
              >
                {t.teamName}
              </Link>
              <ul className="mt-0.5 pl-2 text-dim">
                {t.players.map((p) => (
                  <li key={p.playerId}>
                    <span className="text-[8px] tracking-widest text-dim">
                      {p.position}
                    </span>{" "}
                    <Link
                      href={`/spelare/${p.playerId}`}
                      className="text-white hover:text-cyan"
                    >
                      {p.playerName}
                    </Link>
                    {p.isCaptain && <span className="text-yellow"> ★</span>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
