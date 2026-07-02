"use client";

import Link from "next/link";
import { useState } from "react";
import { pickMyTeam, useMyTeamId } from "./use-my-team";

/** Everything the strip needs per team — assembled server-side in page.tsx. */
export type MyStatusTeam = {
  teamId: string;
  teamName: string;
  slug: string;
  rank: number;
  rankChange: number | null;
  /** Growth this round (öre-exact SEK), null before any squad exists. */
  roundGrowthSek: number | null;
  /** Current-round progress; null when no round has locked yet. */
  progress: { roundNumber: number; played: number; total: number } | null;
};

/**
 * "DITT LÄGE" — the viewer's own situation, first thing on the page.
 * Resolution order: signed-in team (authedTeamId from the server) →
 * previously picked team in localStorage → a one-time picker.
 */
export function MyStatus({
  teams,
  authedTeamId,
}: {
  teams: MyStatusTeam[];
  authedTeamId: string | null;
}) {
  const [picking, setPicking] = useState(false);
  const myId = useMyTeamId(authedTeamId);
  const mine = teams.find((t) => t.teamId === myId) ?? null;

  const pick = (id: string) => {
    pickMyTeam(id);
    setPicking(false);
  };

  return (
    <section className="border border-yellow/40 bg-yellow/5 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[10px] uppercase tracking-widest text-yellow">
          ▌ DITT LÄGE
        </h2>
        {mine && !authedTeamId && (
          <button
            type="button"
            onClick={() => setPicking((p) => !p)}
            className="text-[9px] uppercase tracking-widest text-dim hover:text-yellow"
          >
            [ BYT LAG ]
          </button>
        )}
      </div>

      {mine && !picking ? (
        <MyLine team={mine} />
      ) : (
        <TeamPicker teams={teams} onPick={pick} />
      )}
    </section>
  );
}

function MyLine({ team }: { team: MyStatusTeam }) {
  const p = team.progress;
  const light =
    p === null
      ? "text-dim"
      : p.played > 8
        ? "text-red"
        : p.played > 5
          ? "text-yellow"
          : "text-green";
  return (
    <div className="mt-2">
      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-bold tabular-nums text-yellow">
          PLATS {String(team.rank).padStart(2, "0")}
        </span>
        <RankArrow change={team.rankChange} />
        <Link
          href={`/team/${team.slug}`}
          className="truncate uppercase text-foreground hover:text-cyan"
        >
          {team.teamName}
        </Link>
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[10px] uppercase tracking-widest tabular-nums text-dim">
        {p && (
          <>
            <span>OMG {p.roundNumber}</span>
            <span>·</span>
            <span className={light}>
              {p.played}/{p.total} SPELAT
            </span>
          </>
        )}
        {team.roundGrowthSek !== null && (
          <>
            {p && <span>·</span>}
            <span className={team.roundGrowthSek < 0 ? "text-red" : "text-green"}>
              {team.roundGrowthSek >= 0 ? "+" : ""}
              {fmtSek(team.roundGrowthSek)} DENNA OMGÅNG
            </span>
          </>
        )}
      </p>
    </div>
  );
}

function TeamPicker({
  teams,
  onPick,
}: {
  teams: MyStatusTeam[];
  onPick: (id: string) => void;
}) {
  return (
    <div className="mt-2">
      <label
        htmlFor="my-team-picker"
        className="block text-[10px] uppercase tracking-widest text-dim"
      >
        Vilket lag är ditt? Sparas bara i din webbläsare.
      </label>
      <select
        id="my-team-picker"
        defaultValue=""
        onChange={(e) => e.target.value && onPick(e.target.value)}
        className="mt-1.5 w-full border border-border bg-black px-2 py-1.5 text-xs uppercase tracking-widest text-foreground"
      >
        <option value="" disabled>
          — VÄLJ DITT LAG —
        </option>
        {teams.map((t) => (
          <option key={t.teamId} value={t.teamId}>
            {String(t.rank).padStart(2, "0")} · {t.teamName}
          </option>
        ))}
      </select>
    </div>
  );
}

function RankArrow({ change }: { change: number | null }) {
  if (change === null || change === 0) {
    return <span className="text-[10px] text-dim">–</span>;
  }
  if (change > 0) {
    return (
      <span className="text-[10px] tabular-nums text-green">▲{change}</span>
    );
  }
  return (
    <span className="text-[10px] tabular-nums text-red">▼{Math.abs(change)}</span>
  );
}

function fmtSek(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k`;
  return `${sign}${abs}`;
}
