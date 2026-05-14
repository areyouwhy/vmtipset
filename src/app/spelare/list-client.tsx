"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FilterRow, TeamComboBox } from "@/components/picker-filters";
import { Jersey } from "@/lib/jersey";
import type { PlayerListRow } from "@/lib/players-data";

const POSITION_FILTERS = ["ALL", "GK", "DEF", "MID", "FWD"] as const;
type PositionFilter = (typeof POSITION_FILTERS)[number];

type SortKey = "price" | "name" | "country";

export function PublicPlayersList({ rows }: { rows: PlayerListRow[] }) {
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<PositionFilter>("ALL");
  const [country, setCountry] = useState<string>("ALL");
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

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (position !== "ALL" && r.position !== position) return false;
      if (country !== "ALL" && r.countryCode !== country) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
    const priceOf = (r: PlayerListRow) =>
      r.currentPriceSek ?? r.basePriceSek ?? -Infinity;
    if (sort === "price") {
      return [...filtered].sort((a, b) => priceOf(b) - priceOf(a));
    }
    if (sort === "country") {
      return [...filtered].sort(
        (a, b) =>
          (a.countryCode ?? "").localeCompare(b.countryCode ?? "") ||
          a.name.localeCompare(b.name),
      );
    }
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, search, position, country, sort]);

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

        <FilterRow
          label="SORTERA"
          options={[
            { value: "price", label: "PRIS" },
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
        {visible.map((r) => (
          <li key={r.id}>
            <Link
              href={`/spelare/${r.id}`}
              className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-3 p-3 text-sm transition hover:bg-yellow/5"
            >
              <Jersey code={r.countryCode} size={28} />
              <span className="text-yellow tabular-nums">{r.position}</span>
              <span className="min-w-0">
                <span className="block truncate text-foreground">{r.name}</span>
                <span className="block truncate text-[10px] uppercase tracking-widest text-dim">
                  {r.countryCode ?? "—"}
                  {r.domesticClub && (
                    <>
                      {" · "}
                      <span className="text-cyan/80">{r.domesticClub}</span>
                    </>
                  )}
                </span>
              </span>
              <span className="tabular-nums text-foreground">
                {r.currentPriceSek === null && r.basePriceSek === null
                  ? "—"
                  : `${((r.currentPriceSek ?? r.basePriceSek ?? 0) / 1_000_000).toFixed(1)}M`}
              </span>
            </Link>
          </li>
        ))}
        {visible.length === 0 && (
          <li className="p-4 text-center text-sm text-dim">
            — inga matcher —
          </li>
        )}
      </ul>
    </>
  );
}
