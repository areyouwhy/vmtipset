"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { HetsAccent, HetsPage, HetsRow } from "@/lib/banter";
import type { H2HSquad } from "@/lib/leaderboard";
import { teamSlug } from "@/lib/team-slug";
import { fmtSek, MatchupBody } from "./matchup";

const ACCENT: Record<
  HetsAccent,
  { text: string; border: string; borderSoft: string; bg: string; chip: string }
> = {
  green: {
    text: "text-green",
    border: "border-green",
    borderSoft: "border-green/40",
    bg: "bg-green/5",
    chip: "bg-green text-black",
  },
  cyan: {
    text: "text-cyan",
    border: "border-cyan",
    borderSoft: "border-cyan/40",
    bg: "bg-cyan/5",
    chip: "bg-cyan text-black",
  },
  red: {
    text: "text-red",
    border: "border-red",
    borderSoft: "border-red/40",
    bg: "bg-red/5",
    chip: "bg-red text-black",
  },
};

export function HetsClient({
  pages,
  squads,
  anyScored,
}: {
  pages: HetsPage[];
  squads: Record<string, H2HSquad>;
  anyScored: boolean;
}) {
  const [active, setActive] = useState(0);
  const page = pages[active];
  const accent = ACCENT[page.accent];

  const allRows = useMemo(
    () =>
      pages
        .flatMap((p) => p.rows)
        .sort((a, b) => a.rank - b.rank),
    [pages],
  );

  return (
    <div className="flex flex-col gap-6">
      {/* ── Text-TV chrome ───────────────────────────────────────────── */}
      <div className={`border ${accent.borderSoft} ${accent.bg}`}>
        <header className="flex items-center justify-between border-b border-border px-3 py-2 text-[10px] uppercase tracking-widest">
          <span className="text-dim">
            COPA TEXT
            <span className="tt-blink ml-1 text-foreground">▌</span>
          </span>
          <span className={`tabular-nums ${accent.text}`}>SIDA {page.number}</span>
        </header>

        {/* page tabs + flip */}
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <button
            type="button"
            onClick={() => setActive((i) => Math.max(0, i - 1))}
            disabled={active === 0}
            className="px-1 text-xs text-dim enabled:hover:text-yellow disabled:opacity-30"
            aria-label="Föregående sida"
          >
            ‹
          </button>
          <div className="flex items-center gap-1.5 text-xs tabular-nums">
            {pages.map((p, i) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setActive(i)}
                className={`px-2 py-0.5 transition ${
                  i === active
                    ? ACCENT[p.accent].chip
                    : "text-dim hover:text-foreground"
                }`}
              >
                SIDA {p.number}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setActive((i) => Math.min(pages.length - 1, i + 1))}
            disabled={active === pages.length - 1}
            className="px-1 text-xs text-dim enabled:hover:text-yellow disabled:opacity-30"
            aria-label="Nästa sida"
          >
            ›
          </button>
        </div>

        {/* tier title */}
        <div className="px-3 py-3">
          <h2 className={`text-lg font-bold uppercase tracking-widest ${accent.text}`}>
            {page.title}
          </h2>
          <p className="mt-0.5 text-xs text-dim">{page.subtitle}</p>
        </div>

        {/* rows */}
        <ol className="divide-y divide-border">
          {page.rows.length === 0 ? (
            <li className="px-3 py-4 text-xs text-dim">Tomt här. Lugnt.</li>
          ) : (
            page.rows.map((row) => (
              <HetsRowLine key={row.teamId} row={row} accent={page.accent} />
            ))
          )}
        </ol>
      </div>

      {/* ── Head 2 Head ──────────────────────────────────────────────── */}
      <HeadToHeadPanel rows={allRows} squads={squads} anyScored={anyScored} />
    </div>
  );
}

function HetsRowLine({ row, accent }: { row: HetsRow; accent: HetsAccent }) {
  const a = ACCENT[accent];
  return (
    <li className="flex items-start gap-3 px-3 py-2.5">
      <span className={`mt-0.5 w-6 shrink-0 text-right text-sm font-bold tabular-nums ${a.text}`}>
        {String(row.rank).padStart(2, "0")}
      </span>
      <span className="mt-0.5 w-8 shrink-0">
        <RankArrow change={row.rankChange} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <Link
            href={`/team/${teamSlug(row.teamName)}`}
            className="truncate text-sm text-foreground hover:text-cyan"
          >
            {row.teamName}
            {row.ownerStatus === "pending" && (
              <span className="ml-2 text-[9px] uppercase tracking-widest text-yellow">
                EJ SWISHAD
              </span>
            )}
          </Link>
          <span className="shrink-0 text-sm font-bold tabular-nums text-yellow">
            {row.teamValueSek === null ? "—" : fmtSek(row.teamValueSek)}
          </span>
        </div>
        <p className="text-[10px] uppercase tracking-widest text-dim">
          {row.ownerHandle}
        </p>
      </div>
    </li>
  );
}

// ─── Head 2 Head ────────────────────────────────────────────────────────────

function HeadToHeadPanel({
  rows,
  squads,
  anyScored,
}: {
  rows: HetsRow[];
  squads: Record<string, H2HSquad>;
  anyScored: boolean;
}) {
  // Default to two teams that actually have a released squad, so the trupp-
  // comparison shows on first load instead of two empty columns.
  const withSquad = rows.filter((r) => squads[r.teamId]);
  const [aId, setAId] = useState(
    withSquad[0]?.teamId ?? rows[0]?.teamId ?? "",
  );
  const [bId, setBId] = useState(
    withSquad[1]?.teamId ?? rows[rows.length - 1]?.teamId ?? "",
  );

  const a = rows.find((r) => r.teamId === aId) ?? null;
  const b = rows.find((r) => r.teamId === bId) ?? null;
  const squadA = squads[aId] ?? null;
  const squadB = squads[bId] ?? null;

  return (
    <section className="border border-magenta/40 bg-magenta/5">
      <header className="border-b border-magenta/40 px-3 py-2 text-[10px] uppercase tracking-widest text-magenta">
        HEAD 2 HEAD · STÄLL TVÅ LAG MOT VARANDRA
      </header>

      <div className="grid grid-cols-2 gap-2 border-b border-border px-3 py-3">
        <TeamSelect label="HÖRNA A" value={aId} rows={rows} onChange={setAId} />
        <TeamSelect label="HÖRNA B" value={bId} rows={rows} onChange={setBId} />
      </div>

      {a && b && a.teamId !== b.teamId ? (
        <MatchupBody
          a={a}
          b={b}
          squadA={squadA}
          squadB={squadB}
          anyScored={anyScored}
        />
      ) : (
        <p className="px-3 py-4 text-xs text-dim">
          Välj två olika lag så avgör vi vem som snackar mest skit.
        </p>
      )}
    </section>
  );
}

function TeamSelect({
  label,
  value,
  rows,
  onChange,
}: {
  label: string;
  value: string;
  rows: HetsRow[];
  onChange: (id: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[9px] uppercase tracking-widest text-dim">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-magenta focus:outline-none"
      >
        {rows.map((r) => (
          <option key={r.teamId} value={r.teamId}>
            #{r.rank} · {r.teamName}
          </option>
        ))}
      </select>
    </label>
  );
}

function RankArrow({ change }: { change: number | null }) {
  if (change === null || change === 0) {
    return <span className="text-[9px] text-dim">–</span>;
  }
  if (change > 0) {
    return <span className="text-[9px] tabular-nums text-green">▲{change}</span>;
  }
  return (
    <span className="text-[9px] tabular-nums text-red">▼{Math.abs(change)}</span>
  );
}
