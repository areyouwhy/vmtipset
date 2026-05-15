"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FilterRow, TeamComboBox } from "@/components/picker-filters";
import { Jersey } from "@/lib/jersey";
import type { PlayerListRow } from "@/lib/players-data";

const POSITION_FILTERS = ["ALL", "GK", "DEF", "MID", "FWD"] as const;
type PositionFilter = (typeof POSITION_FILTERS)[number];

type ActiveFilter = "ACTIVE" | "INACTIVE" | "ALL";
type SortKey = "name" | "price" | "country";

export function PlayerListClient({ rows }: { rows: PlayerListRow[] }) {
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<PositionFilter>("ALL");
  const [country, setCountry] = useState<string>("ALL");
  const [activeState, setActiveState] = useState<ActiveFilter>("ACTIVE");
  const [sort, setSort] = useState<SortKey>("name");

  // Team list: prefer rows with a clubName, alphabetical on name.
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

  const inactiveCount = useMemo(
    () => rows.filter((r) => !r.active).length,
    [rows],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (activeState === "ACTIVE" && !r.active) return false;
      if (activeState === "INACTIVE" && r.active) return false;
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
  }, [rows, search, position, country, activeState, sort]);

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
          label={`STATUS (${inactiveCount} INAKTIVA)`}
          options={[
            { value: "ACTIVE", label: "AKTIVA" },
            { value: "INACTIVE", label: "INAKTIVA" },
            { value: "ALL", label: "ALLA" },
          ]}
          value={activeState}
          onChange={(v) => setActiveState(v as ActiveFilter)}
        />

        <FilterRow
          label="SORTERA"
          options={[
            { value: "name", label: "NAMN" },
            { value: "price", label: "PRIS" },
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
              href={`/admin/players/${r.id}`}
              className={`grid grid-cols-[auto_auto_1fr_auto_auto] items-center gap-3 p-3 text-sm transition hover:bg-yellow/5 ${
                r.active ? "" : "opacity-60"
              }`}
            >
              <Jersey code={r.countryCode} size={24} />
              <span className="text-yellow tabular-nums">{r.position}</span>
              <span className="min-w-0">
                <span className="block truncate text-foreground">
                  {r.name}
                  {!r.active && (
                    <span className="ml-2 border border-red px-1 text-[9px] uppercase tracking-widest text-red">
                      INAKTIV
                    </span>
                  )}
                </span>
                <span className="block text-[10px] uppercase tracking-widest text-dim">
                  {r.countryCode ?? "—"} · {r.clubShortName}
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
              <span
                className={
                  r.manualOverrides > 0
                    ? "border border-yellow px-1 text-[10px] uppercase tracking-widest text-yellow"
                    : "text-[10px] text-dim"
                }
              >
                {r.manualOverrides > 0 ? `M${r.manualOverrides}` : "—"}
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
