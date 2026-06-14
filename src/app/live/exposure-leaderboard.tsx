"use client";

import { useState } from "react";
import Link from "next/link";
import type { TeamDailyAggregate } from "@/lib/live-exposure";

type SortKey = "exposure" | "growth";
type SortDir = "desc" | "asc";

// SEK formatter mirroring the team-page convention (− for negative, k/M).
function fmtSek(n: number): string {
  if (n === 0) return "0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k`;
  return `${sign}${abs}`;
}

function GrowthTag({ growthSek }: { growthSek: number }) {
  const color =
    growthSek > 0 ? "text-green" : growthSek < 0 ? "text-red" : "text-dim";
  const arrow = growthSek > 0 ? "↑ " : growthSek < 0 ? "↓ " : "";
  return (
    <span className={`${color} tabular-nums`}>
      {arrow}
      {fmtSek(growthSek)}
    </span>
  );
}

function sortRows(
  rows: TeamDailyAggregate[],
  key: SortKey,
  dir: SortDir,
): TeamDailyAggregate[] {
  const sign = dir === "desc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const primary =
      key === "growth"
        ? b.growthSek - a.growthSek || b.playerCount - a.playerCount
        : b.playerCount - a.playerCount || b.matchCount - a.matchCount;
    return sign * primary || a.teamName.localeCompare(b.teamName, "sv");
  });
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-right uppercase tracking-widest transition hover:text-yellow ${
        active ? "text-cyan" : "text-dim"
      }`}
    >
      {label}
      {active && <span className="ml-0.5">{dir === "desc" ? "▼" : "▲"}</span>}
    </button>
  );
}

export function ExposureLeaderboard({
  heading,
  rows,
  allRevealed,
}: {
  heading: string;
  rows: TeamDailyAggregate[];
  allRevealed: boolean;
}) {
  const [key, setKey] = useState<SortKey>("exposure");
  const [dir, setDir] = useState<SortDir>("desc");

  function clickHeader(k: SortKey) {
    if (k === key) {
      setDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setKey(k);
      setDir("desc");
    }
  }

  if (rows.length === 0) {
    // When some matches are still unrevealed there's nothing meaningful to
    // show yet; stay silent rather than implying "nobody is exposed".
    if (!allRevealed) return null;
    return (
      <section className="mt-8">
        <h2 className="border-b border-border pb-1 text-[10px] uppercase tracking-widest text-cyan">
          {heading}
        </h2>
        <p className="py-3 text-[11px] text-dim">
          — inga lag har spelare i omlopp denna dag —
        </p>
      </section>
    );
  }

  const sorted = sortRows(rows, key, dir);

  return (
    <section className="mt-8">
      <h2 className="border-b border-border pb-1 text-[10px] uppercase tracking-widest text-cyan">
        {heading}
      </h2>
      <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 border-b border-border/40 py-1 text-[8px] uppercase tracking-widest text-dim">
        <span className="w-5 text-right">#</span>
        <span>LAG</span>
        <SortHeader
          label="EXPONERING"
          active={key === "exposure"}
          dir={dir}
          onClick={() => clickHeader("exposure")}
        />
        <SortHeader
          label="TILLVÄXT"
          active={key === "growth"}
          dir={dir}
          onClick={() => clickHeader("growth")}
        />
      </div>
      <ul className="divide-y divide-border/40">
        {sorted.map((t, i) => (
          <li
            key={t.teamId}
            className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 py-1.5 text-[11px]"
          >
            <span className="w-5 text-right tabular-nums text-dim">{i + 1}</span>
            <Link
              href={`/team/${t.teamSlug}`}
              className="truncate text-yellow hover:underline"
            >
              {t.teamName}
            </Link>
            <span className="text-right tabular-nums text-dim">
              <span className="text-white">{t.playerCount}</span> sp ·{" "}
              {t.matchCount} {t.matchCount === 1 ? "match" : "m"}
            </span>
            <span className="w-16 text-right">
              <GrowthTag growthSek={t.growthSek} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
