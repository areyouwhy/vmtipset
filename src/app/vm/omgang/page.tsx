import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { getViewerAuth } from "@/lib/auth";
import { getLeaderboard } from "@/lib/leaderboard";
import type { OmgangNow } from "@/lib/omgang-now";
import { getOmgangNow } from "@/lib/omgang-now-data";
import {
  getOmgangOverview,
  getSeasonLineups,
  type OmgangOverview,
} from "@/lib/omgang-overview-data";
import {
  buildPositionHistory,
  type PositionHistory,
} from "@/lib/position-history";
import { getRoundProgress } from "@/lib/round-progress-data";
import { ROUND_TITLES } from "@/lib/round-titles";
import { teamSlug } from "@/lib/team-slug";
import { getAllMatches } from "@/lib/wc-tournament";
import { RoundStatsLineup } from "./[n]/round-stats-lineup";
import { MyStatus, type MyStatusTeam } from "./my-status";
import { PositionChart } from "./position-chart";

export const revalidate = 600;

export const metadata = {
  title: "OMGÅNGAR — La Copa del Mundo 2026",
  description:
    "Översikt över alla omgångar: rondstatistik, transfers och höjdpunkter.",
};

const STATUS_COLOR: Record<string, string> = {
  upcoming: "text-dim",
  open: "text-cyan",
  locked: "text-yellow",
  scored: "text-green",
};
const STATUS_LABEL: Record<string, string> = {
  upcoming: "KOMMANDE",
  open: "ÖPPEN",
  locked: "LÅST",
  scored: "POÄNGSATT",
};

export default async function OmgangOverviewPage() {
  const [overview, allMatches, seasonLineups, leaderboard, now, progress, viewer] =
    await Promise.all([
      getOmgangOverview(),
      getAllMatches().catch(() => []),
      getSeasonLineups().catch(() => []),
      getLeaderboard().catch(() => null),
      getOmgangNow().catch(() => null),
      getRoundProgress().catch(
        () => ({}) as Awaited<ReturnType<typeof getRoundProgress>>,
      ),
      getViewerAuth(),
    ]);
  const positionHistory = leaderboard ? buildPositionHistory(leaderboard) : null;

  const authedTeamId = viewer.myTeamSlug
    ? (leaderboard?.rows.find((r) => teamSlug(r.teamName) === viewer.myTeamSlug)
        ?.teamId ?? null)
    : null;

  const myStatusTeams: MyStatusTeam[] = (leaderboard?.rows ?? []).map((r) => ({
    teamId: r.teamId,
    teamName: r.teamName,
    slug: teamSlug(r.teamName),
    rank: r.rank,
    rankChange: r.rankChange,
    roundGrowthSek: r.roundGrowthSek,
    progress: progress[r.teamId] ?? null,
  }));

  const matchCountByRound = new Map<number, number>();
  for (const m of allMatches) {
    matchCountByRound.set(
      m.roundNumber,
      (matchCountByRound.get(m.roundNumber) ?? 0) + 1,
    );
  }

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <Breadcrumbs
          trail={[{ label: "VM", href: "/vm" }, { label: "OMGÅNGAR" }]}
        />

        <section className="py-6">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-yellow sm:text-3xl">
            OMGÅNGAR
          </h1>
          <p className="mt-2 text-sm text-dim">
            Översikt över alla {overview.rounds.length} omgångar — höjdpunkter
            och transferstatistik från alla spelade ronder. Klicka in på en
            omgång för matcher, lagval och byten.
          </p>
        </section>

        <div className="space-y-8">
          {myStatusTeams.length > 0 && (
            <MyStatus teams={myStatusTeams} authedTeamId={authedTeamId} />
          )}
          {now && <NowCard now={now} />}
          {positionHistory && (
            <PositionSection history={positionHistory} authedTeamId={authedTeamId} />
          )}

          <section>
            <h2 className="border-b border-border pb-1 text-[10px] uppercase tracking-widest text-cyan">
              ALLA OMGÅNGAR
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {overview.rounds.map((r) => (
                <Link
                  key={r.number}
                  href={`/vm/omgang/${r.number}`}
                  className="group block border border-border p-3 transition hover:border-cyan hover:bg-cyan/5"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs uppercase tracking-widest">
                      <span className="text-dim">OMG </span>
                      <span className="text-yellow tabular-nums">
                        {String(r.number).padStart(2, "0")}
                      </span>
                    </span>
                    <span
                      className={`text-[9px] uppercase tracking-widest ${STATUS_COLOR[r.status]}`}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-foreground group-hover:text-cyan">
                    {ROUND_TITLES[r.number] ?? `OMGÅNG ${r.number}`}
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-widest text-dim tabular-nums">
                    {matchCountByRound.get(r.number) ?? 0} matcher · {r.transferCount}{" "}
                    byten
                  </p>
                </Link>
              ))}
            </div>
          </section>

          <HighlightsBlock h={overview.highlights} />
          <TransfersTotals t={overview.transfers} played={overview.playedCount} />
          {seasonLineups.length > 0 && (
            <section>
              <h2 className="border-b border-border pb-1 text-[10px] uppercase tracking-widest text-cyan">
                ELVOR · ALLA RONDER
              </h2>
              <div className="mt-3">
                <RoundStatsLineup lineups={seasonLineups} />
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

function NowCard({ now }: { now: OmgangNow }) {
  const showDeadline = now.status === "open" && now.deadline !== null;
  const live = now.matchesOngoing > 0;
  return (
    <Link
      href={`/vm/omgang/${now.number}`}
      className="group block border border-cyan/40 bg-cyan/5 p-3 transition hover:border-cyan"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest text-cyan">
          ▌ JUST NU · OMG{" "}
          <span className="tabular-nums">{String(now.number).padStart(2, "0")}</span>
        </span>
        <span
          className={`text-[9px] uppercase tracking-widest ${STATUS_COLOR[now.status]}`}
        >
          {STATUS_LABEL[now.status]}
        </span>
      </div>
      <p className="mt-1 truncate text-sm uppercase text-foreground group-hover:text-cyan">
        {ROUND_TITLES[now.number] ?? now.name}
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[10px] uppercase tracking-widest tabular-nums text-dim">
        {now.matchesTotal > 0 && (
          <span>
            {now.matchesFinished}/{now.matchesTotal} MATCHER KLARA
          </span>
        )}
        {live && (
          <>
            <span>·</span>
            <span className="text-red">
              <span className="tt-blink">●</span> {now.matchesOngoing} LIVE
            </span>
          </>
        )}
        {showDeadline && (
          <>
            {now.matchesTotal > 0 && <span>·</span>}
            <span className="text-yellow">DEADLINE {fmtDeadline(now.deadline!)}</span>
          </>
        )}
      </p>
    </Link>
  );
}

function fmtDeadline(d: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Stockholm",
  })
    .format(d)
    .toUpperCase();
}

function PositionSection({
  history,
  authedTeamId,
}: {
  history: PositionHistory;
  authedTeamId: string | null;
}) {
  const s = history.stats;
  const cells: { label: string; value: string; sub?: string; tone?: string }[] =
    [];
  if (s.bestClimb)
    cells.push({
      label: "STÖRSTA KLÄTTRING",
      value: s.bestClimb.teamName,
      sub: `▲${s.bestClimb.delta} · ${s.bestClimb.tick}`,
      tone: "text-green",
    });
  if (s.worstFall)
    cells.push({
      label: "STÖRSTA RAS",
      value: s.worstFall.teamName,
      sub: `▼${Math.abs(s.worstFall.delta)} · ${s.worstFall.tick}`,
      tone: "text-red",
    });
  if (s.mostAtTop)
    cells.push({
      label: "FLEST RONDER I TOPP",
      value: s.mostAtTop.teamName,
      sub: `${s.mostAtTop.count}× PLATS 01`,
      tone: "text-yellow",
    });
  if (s.bestRound)
    cells.push({
      label: "BÄSTA RONDPOÄNG",
      value: s.bestRound.teamName,
      sub: `${growthLabel(s.bestRound.pointsSek)} · R${s.bestRound.roundNumber}`,
      tone: "text-green",
    });

  return (
    // Breaks out of the page's max-w-2xl column on desktop — the 31-line
    // bump chart needs the horizontal room (896px on lg, 992px on xl).
    <section className="lg:-mx-28 xl:-mx-40">
      <h2 className="border-b border-border pb-1 text-[10px] uppercase tracking-widest text-cyan">
        POSITIONSGRAF · RUNDA FÖR RUNDA
      </h2>
      <div className="mt-3">
        <PositionChart history={history} authedTeamId={authedTeamId} />
      </div>
      {cells.length > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {cells.map((c) => (
            <Cell key={c.label} k={c.label} v={c.value} sub={c.sub} tone={c.tone} />
          ))}
        </dl>
      )}
    </section>
  );
}

function HighlightsBlock({ h }: { h: OmgangOverview["highlights"] }) {
  const cells: {
    label: string;
    value: string;
    sub?: string;
    tone?: string;
    href?: string;
  }[] = [];
  if (h.topPlayer)
    cells.push({
      label: "POPULÄRAST",
      value: h.topPlayer.name,
      sub: `${h.topPlayer.count} lag · R${h.topPlayer.roundNumber}`,
      href: `/spelare/${h.topPlayer.id}`,
    });
  if (h.bestPick)
    cells.push({
      label: "BÄSTA VALET",
      value: h.bestPick.name,
      sub: `${growthLabel(h.bestPick.growthSek)} · R${h.bestPick.roundNumber}`,
      tone: "text-green",
      href: `/spelare/${h.bestPick.id}`,
    });
  if (h.worstPick)
    cells.push({
      label: "SÄMSTA VALET",
      value: h.worstPick.name,
      sub: `${growthLabel(h.worstPick.growthSek)} · R${h.worstPick.roundNumber}`,
      tone: "text-red",
      href: `/spelare/${h.worstPick.id}`,
    });
  if (h.bestCaptain)
    cells.push({
      label: "BÄSTA © KAPTENVALET",
      value: h.bestCaptain.name,
      sub: `${growthLabel(h.bestCaptain.growthSek)} · R${h.bestCaptain.roundNumber}`,
      tone: "text-green",
      href: `/spelare/${h.bestCaptain.id}`,
    });

  return (
    <section>
      <h2 className="border-b border-border pb-1 text-[10px] uppercase tracking-widest text-cyan">
        HÖJDPUNKTER · ALLA RONDER
      </h2>
      {cells.length === 0 ? (
        <p className="mt-3 border border-dashed border-border p-3 text-xs text-dim">
          — statistik visas när en rond har spelats —
        </p>
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {cells.map((c) => (
            <Cell
              key={c.label}
              k={c.label}
              v={c.value}
              sub={c.sub}
              tone={c.tone}
              href={c.href}
            />
          ))}
        </dl>
      )}
    </section>
  );
}

function TransfersTotals({
  t,
  played,
}: {
  t: OmgangOverview["transfers"];
  played: number;
}) {
  return (
    <section>
      <h2 className="border-b border-border pb-1 text-[10px] uppercase tracking-widest text-cyan">
        TRANSFERS · TOTALT
      </h2>
      {t.totalChanges === 0 ? (
        <p className="mt-3 border border-dashed border-border p-3 text-xs text-dim">
          — inga byten gjorda ännu —
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <dl className="grid grid-cols-3 gap-2">
            <Cell k="TOTALT BYTEN" v={String(t.totalChanges)} />
            <Cell k="AKTIVA LAG" v={String(t.teamsActive)} />
            <Cell k="AVGIFTER" v={fmtSek(t.totalFeesSek)} />
          </dl>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {t.mostIn && (
              <Cell
                k="MEST INKÖPT"
                v={t.mostIn.name}
                sub={`${t.mostIn.count}×`}
                tone="text-green"
                href={`/spelare/${t.mostIn.id}`}
              />
            )}
            {t.mostOut && (
              <Cell
                k="MEST SÅLD"
                v={t.mostOut.name}
                sub={`${t.mostOut.count}×`}
                tone="text-red"
                href={`/spelare/${t.mostOut.id}`}
              />
            )}
            {t.mostActiveTeam && (
              <Cell
                k="FLEST BYTEN (LAG)"
                v={t.mostActiveTeam.teamName}
                sub={`${t.mostActiveTeam.count} byten`}
                tone="text-yellow"
                href={`/team/${t.mostActiveTeam.teamSlug}`}
              />
            )}
            {t.biggestBuy && (
              <Cell
                k="DYRASTE KÖP"
                v={t.biggestBuy.name}
                sub={`${fmtSek(t.biggestBuy.priceSek)} · R${t.biggestBuy.roundNumber}`}
                tone="text-yellow"
                href={`/spelare/${t.biggestBuy.id}`}
              />
            )}
            {t.highestFee && (
              <Cell
                k="HÖGSTA AVGIFT"
                v={fmtSek(t.highestFee.feeSek)}
                sub={`${t.highestFee.teamName} · R${t.highestFee.roundNumber}`}
                tone="text-red"
              />
            )}
          </dl>
          <p className="text-[10px] uppercase tracking-widest text-dim">
            över {played} spelade ronder
          </p>
        </div>
      )}
    </section>
  );
}

function Cell({
  k,
  v,
  sub,
  tone,
  href,
}: {
  k: string;
  v: string;
  sub?: string;
  tone?: string;
  href?: string;
}) {
  return (
    <div className="border border-border p-2">
      <dt className="text-[9px] uppercase tracking-widest text-dim">{k}</dt>
      <dd className="mt-0.5 truncate text-sm" title={v}>
        {href ? (
          <Link href={href} className="text-foreground hover:text-cyan">
            {v}
          </Link>
        ) : (
          <span className="text-foreground">{v}</span>
        )}
      </dd>
      {sub && (
        <dd className={`text-[10px] tabular-nums ${tone ?? "text-dim"}`}>
          {sub}
        </dd>
      )}
    </div>
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
