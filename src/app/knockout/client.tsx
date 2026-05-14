"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Jersey } from "@/lib/jersey";
import type { WcMatch, WcTeam } from "@/lib/wc-tournament";

type StageKey = "r32" | "r16" | "qf" | "sf" | "final";

type SerialisedStages = Record<StageKey, WcMatch[]> & { bronze: WcMatch[] };

type Team = WcTeam;

const TAB_LABELS: Record<StageKey, string> = {
  r32: "32-DEL",
  r16: "ÅTTONDEL",
  qf: "KVARTSFINAL",
  sf: "SEMIFINAL",
  final: "FINAL",
};

const TAB_ORDER: StageKey[] = ["r32", "r16", "qf", "sf", "final"];

export function KnockoutTabs({
  stages,
  teams,
}: {
  stages: SerialisedStages;
  teams: { id: number; code: string; name: string }[];
}) {
  const teamsById = useMemo(() => {
    const m = new Map<number, Team>();
    for (const t of teams) m.set(t.id, { externalId: t.id, code: t.code, name: t.name });
    return m;
  }, [teams]);

  // Default: first stage that has at least one non-pending match (i.e. the
  // current live/most-recent stage), falling back to R32.
  const initial = useMemo<StageKey>(() => {
    for (const key of [...TAB_ORDER].reverse()) {
      if (stages[key].some((m) => m.status !== "pending")) return key;
    }
    return "r32";
  }, [stages]);

  const [active, setActive] = useState<StageKey>(initial);
  const activeMatches = stages[active];
  const bronzeMatches = stages.bronze;

  return (
    <>
      {/* Tab bar */}
      <nav className="-mx-4 flex snap-x snap-mandatory gap-1 overflow-x-auto border-y border-border bg-black/60 px-4 py-2 sm:mx-0 sm:px-0">
        {TAB_ORDER.map((key) => {
          const count = stages[key].length;
          const isActive = key === active;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActive(key)}
              className={`shrink-0 snap-start border px-3 py-1.5 text-[10px] uppercase tracking-widest transition ${
                isActive
                  ? key === "final"
                    ? "border-yellow bg-yellow text-black"
                    : "border-cyan bg-cyan text-black"
                  : "border-border text-dim hover:border-cyan hover:text-cyan"
              }`}
            >
              <span>{TAB_LABELS[key]}</span>
              <span
                className={`ml-1.5 text-[9px] tabular-nums ${
                  isActive ? "text-black/70" : "text-dim"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Match list for the active tab */}
      <ul className="mt-6 space-y-2">
        {activeMatches.length === 0 ? (
          <li className="border border-dashed border-border p-3 text-[10px] uppercase tracking-widest text-dim">
            — väntar på lottning —
          </li>
        ) : (
          activeMatches.map((m) => (
            <li key={m.externalId}>
              <MatchCard m={m} teamsById={teamsById} accent={active === "final"} />
            </li>
          ))
        )}

        {active === "final" && bronzeMatches.length > 0 && (
          <>
            <li className="pt-4 text-[10px] uppercase tracking-widest text-dim">
              BRONSMATCH
            </li>
            {bronzeMatches.map((m) => (
              <li key={m.externalId}>
                <MatchCard m={m} teamsById={teamsById} muted />
              </li>
            ))}
          </>
        )}
      </ul>
    </>
  );
}

function MatchCard({
  m,
  teamsById,
  accent,
  muted,
}: {
  m: WcMatch;
  teamsById: Map<number, Team>;
  accent?: boolean;
  muted?: boolean;
}) {
  const home = teamsById.get(m.homeTeamId);
  const away = teamsById.get(m.awayTeamId);
  const kickoff = new Date(m.kickoff);
  const dateLabel = kickoff.toLocaleDateString("sv-SE", {
    month: "short",
    day: "numeric",
  });
  const timeLabel = kickoff.toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const played = m.status === "finished" && m.homeScore !== null;
  const homeWon = played && (m.homeScore ?? 0) > (m.awayScore ?? 0);
  const awayWon = played && (m.awayScore ?? 0) > (m.homeScore ?? 0);
  const ongoing = m.status === "ongoing";

  return (
    <article
      className={`grid grid-cols-[auto_1fr] border bg-black/30 ${
        accent ? "border-yellow" : muted ? "border-border/60" : "border-border"
      }`}
    >
      {/* Left rail: date + FT/time, like the reference */}
      <div className="flex w-[58px] flex-col items-center justify-center border-r border-border/70 px-1.5 py-1 text-[10px] uppercase leading-tight tracking-widest text-dim">
        <span>{dateLabel}</span>
        <span className={ongoing ? "text-cyan" : ""}>
          {played ? "FT" : ongoing ? "LIVE" : timeLabel}
        </span>
      </div>
      <div className="min-w-0">
        <Side
          team={home}
          score={m.homeScore}
          winner={homeWon}
          loser={played && !homeWon}
        />
        <Side
          team={away}
          score={m.awayScore}
          winner={awayWon}
          loser={played && !awayWon}
          isBottom
        />
      </div>
    </article>
  );
}

function Side({
  team,
  score,
  winner,
  loser,
  isBottom,
}: {
  team: Team | undefined;
  score: number | null;
  winner: boolean;
  loser: boolean;
  isBottom?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[auto_auto_1fr] items-center gap-2 px-3 py-1.5 text-[13px] ${
        isBottom ? "border-t border-border/40" : ""
      } ${
        winner
          ? "text-yellow font-bold"
          : loser
            ? "text-dim line-through"
            : "text-foreground"
      }`}
    >
      <span className="w-[28px] text-right tabular-nums text-[14px]">
        {score === null ? "" : score}
      </span>
      {team ? <Jersey code={team.code} size={20} /> : <span className="h-5 w-5" />}
      <span className="min-w-0 truncate">
        {team ? (
          <Link href={`/landslag/${team.code}`} className="hover:text-cyan">
            {team.name}
          </Link>
        ) : (
          <span className="text-dim">TBD</span>
        )}
      </span>
    </div>
  );
}
