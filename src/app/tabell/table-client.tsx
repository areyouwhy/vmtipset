"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Leaderboard, LeaderboardRow } from "@/lib/leaderboard";
import { teamSlug } from "@/lib/team-slug";

const MAX_COMPARE = 3;

export function TabellClient({
  rows,
  rounds,
}: {
  rows: LeaderboardRow[];
  rounds: Leaderboard["rounds"];
  anyScored: boolean;
}) {
  const [pinned, setPinned] = useState<Set<string>>(new Set());

  function togglePin(id: string) {
    setPinned((cur) => {
      const next = new Set(cur);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_COMPARE) {
        next.add(id);
      }
      return next;
    });
  }

  const pinnedRows = useMemo(
    () =>
      [...pinned]
        .map((id) => rows.find((r) => r.teamId === id))
        .filter((r): r is LeaderboardRow => !!r)
        .sort((a, b) => a.rank - b.rank),
    [pinned, rows],
  );

  const scored = rounds.filter((r) => r.isScored);

  return (
    <>
      {pinnedRows.length >= 2 && (
        <ComparePanel
          rows={pinnedRows}
          rounds={scored}
          onClear={() => setPinned(new Set())}
          onRemove={togglePin}
        />
      )}

      {/* The main table. Tight columns, monospace numbers. */}
      <div className="overflow-x-auto border border-border">
        <table className="w-full border-collapse text-sm">
          <thead className="text-[9px] uppercase tracking-widest text-dim">
            <tr className="border-b border-border">
              <th className="w-7 px-2 py-2 text-left"></th>
              <th className="w-10 px-2 py-2 text-left">#</th>
              <th className="px-2 py-2 text-left">LAG</th>
              <th className="px-2 py-2 text-right text-yellow">VÄRDE</th>
              <th className="px-2 py-2 text-right">SQUAD</th>
              <th className="px-2 py-2 text-right">BANK</th>
              <th className="px-2 py-2 text-right text-cyan">D</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((row) => {
              const isPinned = pinned.has(row.teamId);
              const disabled = !isPinned && pinned.size >= MAX_COMPARE;
              return (
                <tr
                  key={row.teamId}
                  className={`tabular-nums transition ${
                    isPinned ? "bg-cyan/5" : "hover:bg-yellow/5"
                  }`}
                >
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => togglePin(row.teamId)}
                      disabled={disabled}
                      aria-pressed={isPinned}
                      aria-label={
                        isPinned ? "Ta bort från jämförelse" : "Jämför detta lag"
                      }
                      className={`block h-4 w-4 border text-center text-[10px] leading-none transition ${
                        isPinned
                          ? "border-cyan bg-cyan text-black"
                          : disabled
                            ? "border-border/50 text-dim/50 cursor-not-allowed"
                            : "border-border text-dim hover:border-cyan hover:text-cyan"
                      }`}
                    >
                      {isPinned ? "✓" : ""}
                    </button>
                  </td>
                  <td className="px-2 py-2 text-yellow">
                    <span className="font-bold">
                      {String(row.rank).padStart(2, "0")}
                    </span>
                    <RankArrow change={row.rankChange} />
                  </td>
                  <td className="min-w-0 px-2 py-2">
                    <Link
                      href={`/team/${teamSlug(row.teamName)}`}
                      className="block truncate text-foreground hover:text-cyan"
                    >
                      {row.teamName}
                    </Link>
                    <span className="block truncate text-[10px] uppercase tracking-widest text-dim">
                      {row.ownerHandle}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right text-yellow font-bold">
                    {row.teamValueSek === null ? "—" : fmtSek(row.teamValueSek)}
                  </td>
                  <td className="px-2 py-2 text-right text-foreground">
                    {row.squadValueSek === null ? "—" : fmtSek(row.squadValueSek)}
                  </td>
                  <td
                    className={`px-2 py-2 text-right ${row.bankSek !== null && row.bankSek < 0 ? "text-red" : "text-foreground"}`}
                  >
                    {row.bankSek === null ? "—" : fmtSek(row.bankSek)}
                  </td>
                  <td className="px-2 py-2 text-right text-cyan">
                    {row.dailyBetsPoints || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[10px] uppercase tracking-widest text-dim">
        VÄRDE = SQUAD + BANK · D = DAGENS BET · {pinned.size}/{MAX_COMPARE} VALDA FÖR JÄMFÖRELSE
      </p>
    </>
  );
}

function ComparePanel({
  rows,
  rounds,
  onClear,
  onRemove,
}: {
  rows: LeaderboardRow[];
  rounds: Leaderboard["rounds"];
  onClear: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="mb-4 border border-cyan bg-cyan/5">
      <header className="flex items-baseline justify-between gap-3 border-b border-cyan/60 px-3 py-2 text-[10px] uppercase tracking-widest">
        <span className="text-cyan">JÄMFÖR · {rows.length} LAG</span>
        <button
          type="button"
          onClick={onClear}
          className="text-dim hover:text-red"
        >
          RENSA ✕
        </button>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead className="text-[9px] uppercase tracking-widest text-dim">
            <tr className="border-b border-cyan/30">
              <th className="px-2 py-1.5 text-left">·</th>
              {rows.map((r) => (
                <th key={r.teamId} className="px-2 py-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => onRemove(r.teamId)}
                    title="Ta bort"
                    className="block w-full text-right text-yellow hover:text-red"
                  >
                    #{String(r.rank).padStart(2, "0")} · {r.teamName}
                  </button>
                  <span className="block text-[9px] text-dim">
                    {r.ownerHandle}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-cyan/20">
            <CompareStat
              label="LAGVÄRDE"
              accent="yellow"
              cells={rows.map((r) =>
                r.teamValueSek === null ? "—" : fmtSek(r.teamValueSek),
              )}
            />
            <CompareStat
              label="SQUAD"
              cells={rows.map((r) =>
                r.squadValueSek === null ? "—" : fmtSek(r.squadValueSek),
              )}
            />
            <CompareStat
              label="BANK"
              cells={rows.map((r) =>
                r.bankSek === null ? "—" : fmtSek(r.bankSek),
              )}
            />
            <CompareStat
              label="Δ TOT"
              cells={rows.map((r) => fmtSek(r.totalPointsSek))}
            />
            <CompareStat
              label="DAGENS BET"
              accent="cyan"
              cells={rows.map((r) => (r.dailyBetsPoints || 0).toString())}
            />
            {rounds.map((round) => (
              <CompareStat
                key={round.id}
                label={`R${round.number}`}
                muted
                cells={rows.map((r) => {
                  const v = r.perRound.find(
                    (p) => p.roundId === round.id,
                  )?.pointsSek;
                  return v == null ? "—" : fmtSek(v);
                })}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CompareStat({
  label,
  cells,
  accent,
  muted,
}: {
  label: string;
  cells: string[];
  accent?: "yellow" | "cyan";
  muted?: boolean;
}) {
  const valClass = accent === "yellow"
    ? "text-yellow font-bold"
    : accent === "cyan"
      ? "text-cyan"
      : muted
        ? "text-dim"
        : "text-foreground";
  return (
    <tr>
      <th className="px-2 py-1 text-left text-[10px] uppercase tracking-widest text-dim">
        {label}
      </th>
      {cells.map((v, i) => (
        <td key={i} className={`px-2 py-1 text-right ${valClass}`}>
          {v}
        </td>
      ))}
    </tr>
  );
}

function RankArrow({ change }: { change: number | null }) {
  if (change === null || change === 0) return null;
  if (change > 0) {
    return (
      <span className="ml-1 text-[9px] tabular-nums text-green">↑{change}</span>
    );
  }
  return (
    <span className="ml-1 text-[9px] tabular-nums text-red">
      ↓{Math.abs(change)}
    </span>
  );
}

function fmtSek(n: number): string {
  if (n === 0) return "0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k`;
  return `${sign}${abs}`;
}
