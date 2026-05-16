"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FilterRow, TeamComboBox } from "@/components/picker-filters";
import { Jersey } from "@/lib/jersey";
import type { PlayerListRow } from "@/lib/players-data";

function fmtSekShort(n: number): string {
  if (n === 0) return "0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "+";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k`;
  return `${sign}${abs}`;
}

const POSITION_FILTERS = ["ALL", "GK", "DEF", "MID", "FWD"] as const;
type PositionFilter = (typeof POSITION_FILTERS)[number];

type SortKey = "price" | "name" | "country" | "growth" | "goals";

export function PublicPlayersList({ rows }: { rows: PlayerListRow[] }) {
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<PositionFilter>("ALL");
  const [country, setCountry] = useState<string>("ALL");
  const [club, setClub] = useState<string>("ALL");
  const [sort, setSort] = useState<SortKey>("price");

  // Build the team list once, alphabetically by name — same shape the
  // squad picker uses.
  const teams = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) {
      if (r.countryCode && !seen.has(r.countryCode)) {
        seen.set(r.countryCode, r.clubName);
      }
    }
    return [...seen.entries()]
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "sv"));
  }, [rows]);

  // Domestic-club list pulled from PLAYER_CLUBS values that actually appear
  // in this row set. Sorted by player-count desc, then alphabetical.
  const clubsList = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (r.domesticClub) {
        counts.set(r.domesticClub, (counts.get(r.domesticClub) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "sv"),
      )
      .map(([name]) => ({ code: name, name }));
  }, [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (position !== "ALL" && r.position !== position) return false;
      if (country !== "ALL" && r.countryCode !== country) return false;
      if (club !== "ALL" && r.domesticClub !== club) return false;
      if (
        q &&
        !r.name.toLowerCase().includes(q) &&
        !(r.domesticClub?.toLowerCase().includes(q) ?? false)
      ) {
        return false;
      }
      return true;
    });
    const priceOf = (r: PlayerListRow) =>
      r.currentPriceSek ?? r.basePriceSek ?? -Infinity;
    if (sort === "price") {
      return [...filtered].sort((a, b) => priceOf(b) - priceOf(a));
    }
    if (sort === "growth") {
      return [...filtered].sort(
        (a, b) =>
          b.stats.totalGrowthSek - a.stats.totalGrowthSek ||
          a.name.localeCompare(b.name),
      );
    }
    if (sort === "goals") {
      return [...filtered].sort(
        (a, b) =>
          b.stats.goals - a.stats.goals ||
          b.stats.assists - a.stats.assists ||
          a.name.localeCompare(b.name),
      );
    }
    if (sort === "country") {
      return [...filtered].sort(
        (a, b) =>
          (a.countryCode ?? "").localeCompare(b.countryCode ?? "") ||
          a.name.localeCompare(b.name),
      );
    }
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, search, position, country, club, sort]);

  return (
    <>
      <div className="mb-3 space-y-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="SÖK SPELARE…"
          className="block w-full border border-border bg-transparent px-3 py-2 text-sm uppercase tracking-widest text-foreground placeholder:text-dim focus:border-yellow focus:outline-none"
        />

        <FilterRow
          label="POSITION"
          options={POSITION_FILTERS.map((p) => ({
            value: p,
            label: p === "ALL" ? "ALLA" : p,
          }))}
          value={position}
          onChange={(v) => setPosition(v as PositionFilter)}
        />

        <TeamComboBox teams={teams} value={country} onChange={setCountry} />

        <TeamComboBox
          teams={clubsList}
          value={club}
          onChange={setClub}
          label="KLUBBLAG"
          allLabel="ALLA KLUBBAR"
          searchPlaceholder="SÖK KLUBB…"
          showJersey={false}
        />

        <FilterRow
          label="SORTERA"
          options={[
            { value: "price", label: "PRIS" },
            { value: "growth", label: "TILLVÄXT" },
            { value: "goals", label: "MÅL" },
            { value: "name", label: "NAMN" },
            { value: "country", label: "LAND" },
          ]}
          value={sort}
          onChange={(v) => setSort(v as SortKey)}
        />
      </div>

      <p className="mt-3 text-[10px] uppercase tracking-widest text-dim">
        {visible.length} SPELARE
      </p>

      <ul className="mt-1 divide-y divide-border border border-border">
        {visible.map((r) => {
          const hasStats =
            r.stats.totalGrowthSek !== 0 ||
            r.stats.goals > 0 ||
            r.stats.assists > 0 ||
            r.stats.yellowCards > 0 ||
            r.stats.redCards > 0 ||
            r.stats.shotsOnGoal > 0 ||
            r.stats.saves > 0 ||
            r.stats.manOfTheMatch > 0;
          return (
            <li key={r.id}>
              <Link
                href={`/spelare/${r.id}`}
                className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-3 p-3 text-sm transition hover:bg-yellow/5"
              >
                <Jersey code={r.countryCode} size={28} />
                <span className="text-yellow tabular-nums">{r.position}</span>
                <span className="min-w-0">
                  <span className="block truncate text-foreground">
                    {r.name}
                  </span>
                  <span className="block truncate text-[10px] uppercase tracking-widest text-dim">
                    {r.countryCode ?? "—"}
                    {r.domesticClub && (
                      <>
                        {" · "}
                        <span className="text-cyan/80">{r.domesticClub}</span>
                      </>
                    )}
                  </span>
                  {hasStats && (
                    <span className="mt-1 block text-[10px] uppercase tracking-widest tabular-nums text-dim">
                      <span
                        className={
                          r.stats.totalGrowthSek > 0
                            ? "text-green"
                            : r.stats.totalGrowthSek < 0
                              ? "text-red"
                              : "text-dim"
                        }
                      >
                        Δ {fmtSekShort(r.stats.totalGrowthSek)}
                      </span>
                      {r.stats.goals > 0 && (
                        <span className="ml-2 text-foreground">
                          ⚽ {r.stats.goals}
                        </span>
                      )}
                      {r.stats.assists > 0 && (
                        <span className="ml-2 text-foreground">
                          🅰 {r.stats.assists}
                        </span>
                      )}
                      {r.stats.yellowCards > 0 && (
                        <span className="ml-2 text-yellow">
                          🟨 {r.stats.yellowCards}
                        </span>
                      )}
                      {r.stats.redCards > 0 && (
                        <span className="ml-2 text-red">
                          🟥 {r.stats.redCards}
                        </span>
                      )}
                      {r.stats.saves > 0 && (
                        <span className="ml-2 text-foreground">
                          ✋ {r.stats.saves}
                        </span>
                      )}
                    </span>
                  )}
                </span>
                <span className="tabular-nums text-foreground">
                  {r.currentPriceSek === null && r.basePriceSek === null
                    ? "—"
                    : `${((r.currentPriceSek ?? r.basePriceSek ?? 0) / 1_000_000).toFixed(1)}M`}
                </span>
              </Link>
            </li>
          );
        })}
        {visible.length === 0 && (
          <li className="p-4 text-center text-sm text-dim">
            — inga matcher —
          </li>
        )}
      </ul>
    </>
  );
}
