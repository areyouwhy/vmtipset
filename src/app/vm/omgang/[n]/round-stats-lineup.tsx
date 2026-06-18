"use client";

import { useState } from "react";
import Link from "next/link";
import { PitchJersey } from "@/lib/jersey";
import type { LineupOption } from "@/lib/round-stats-data";
import type { RoundEleven, RoundStatPlayer } from "@/lib/round-stats";

function fmtSek(n: number): string {
  if (n === 0) return "0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k`;
  return `${sign}${abs}`;
}

function GrowthTag({ n }: { n: number }) {
  const color = n > 0 ? "text-green" : n < 0 ? "text-red" : "text-dim";
  const arrow = n > 0 ? "↑" : n < 0 ? "↓" : "";
  return (
    <span className={`${color} tabular-nums`}>
      {arrow}
      {fmtSek(n)}
    </span>
  );
}

export function RoundStatsLineup({ lineups }: { lineups: LineupOption[] }) {
  const [active, setActive] = useState(0);
  if (lineups.length === 0) return null;
  const opt = lineups[Math.min(active, lineups.length - 1)];

  return (
    <div className="border border-border">
      {/* mode toggle */}
      <div className="flex flex-wrap gap-1 border-b border-border p-2">
        {lineups.map((l, i) => (
          <button
            key={l.key}
            type="button"
            onClick={() => setActive(i)}
            className={`px-2 py-1 text-[10px] uppercase tracking-widest transition ${
              i === active
                ? "bg-yellow text-black"
                : "text-dim hover:text-foreground"
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      {/* header */}
      <div className="flex items-baseline justify-between gap-2 px-3 py-2 text-[11px]">
        <span className="truncate">
          {opt.href ? (
            <Link href={opt.href} className="text-yellow hover:underline">
              {opt.sublabel}
            </Link>
          ) : (
            <span className="text-cyan">{opt.sublabel}</span>
          )}
          <span className="ml-2 text-dim">{opt.eleven.formation}</span>
        </span>
        <span className="shrink-0 uppercase tracking-widest text-dim">
          {opt.metric === "ownership" ? (
            <>
              Ø {avgOwners(opt.eleven)} {opt.ownerUnit ?? "lag"}
            </>
          ) : (
            <>
              Σ <GrowthTag n={opt.eleven.totalGrowthSek} />
            </>
          )}
        </span>
      </div>

      <Pitch
        eleven={opt.eleven}
        metric={opt.metric ?? "growth"}
        ownerUnit={opt.ownerUnit ?? "lag"}
      />
    </div>
  );
}

function avgOwners(eleven: RoundEleven): number {
  const all = [...eleven.GK, ...eleven.DEF, ...eleven.MID, ...eleven.FWD];
  if (all.length === 0) return 0;
  const total = all.reduce((acc, p) => acc + (p.ownerCount ?? 0), 0);
  return Math.round(total / all.length);
}

function Pitch({
  eleven,
  metric,
  ownerUnit,
}: {
  eleven: RoundEleven;
  metric: "growth" | "ownership";
  ownerUnit: string;
}) {
  return (
    <div
      className="relative w-full overflow-hidden bg-[#0e2916]"
      style={{ aspectRatio: "3 / 4" }}
    >
      <div className="absolute inset-0 flex flex-col justify-around p-2">
        {(["GK", "DEF", "MID", "FWD"] as const).map((row) => (
          <Row
            key={row}
            players={eleven[row]}
            captainId={eleven.captainId}
            metric={metric}
            ownerUnit={ownerUnit}
          />
        ))}
      </div>
    </div>
  );
}

function Row({
  players,
  captainId,
  metric,
  ownerUnit,
}: {
  players: RoundStatPlayer[];
  captainId: string | null;
  metric: "growth" | "ownership";
  ownerUnit: string;
}) {
  return (
    <div className="flex items-end justify-around gap-1">
      {players.map((p) => (
        <Chip
          key={p.id}
          player={p}
          isCaptain={p.id === captainId}
          metric={metric}
          ownerUnit={ownerUnit}
        />
      ))}
    </div>
  );
}

function Chip({
  player,
  isCaptain,
  metric,
  ownerUnit,
}: {
  player: RoundStatPlayer;
  isCaptain: boolean;
  metric: "growth" | "ownership";
  ownerUnit: string;
}) {
  const lastName = player.name.split(" ").slice(-1)[0] ?? player.name;
  return (
    <Link
      href={`/spelare/${player.id}`}
      className="flex min-w-0 flex-1 flex-col items-center transition hover:opacity-80"
      title={player.name}
    >
      <div className="relative">
        <PitchJersey
          countryCode={player.countryCode}
          size={60}
          ringClass={isCaptain ? "ring-2 ring-yellow" : ""}
        />
        {isCaptain && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center border border-yellow bg-yellow text-[9px] font-bold leading-none text-black">
            C
          </span>
        )}
      </div>
      <span className="mt-1 max-w-full truncate text-[9px] text-white">
        {lastName}
      </span>
      <span className="text-[9px]">
        {metric === "ownership" ? (
          <span className="tabular-nums text-cyan">
            {player.ownerCount ?? 0} {ownerUnit}
          </span>
        ) : (
          <GrowthTag n={player.growthSek} />
        )}
      </span>
    </Link>
  );
}
