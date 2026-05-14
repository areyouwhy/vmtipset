"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Jersey } from "@/lib/jersey";
import type { PlayerListRow } from "@/lib/players-data";

const POSITIONS = ["ALL", "GK", "DEF", "MID", "FWD"] as const;

type SortKey = "name" | "price" | "country";

export function PublicPlayersList({ rows }: { rows: PlayerListRow[] }) {
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<(typeof POSITIONS)[number]>("ALL");
  const [country, setCountry] = useState<string>("ALL");
  const [sort, setSort] = useState<SortKey>("price");

  const countries = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.countryCode) s.add(r.countryCode);
    return Array.from(s).sort();
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
      return [...filtered].sort((a, b) =>
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
          placeholder="Sök på namn..."
          className="block w-full border border-border bg-transparent px-3 py-2 text-sm text-foreground focus:border-yellow focus:outline-none"
        />
        <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1">
          {POSITIONS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPosition(p)}
              className={`shrink-0 snap-start border px-3 py-1.5 text-[10px] uppercase tracking-widest transition ${
                position === p
                  ? "border-yellow bg-yellow text-black"
                  : "border-border text-dim hover:border-cyan hover:text-cyan"
              }`}
            >
              {p === "ALL" ? "ALLA" : p}
            </button>
          ))}
        </div>
        <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1">
          <button
            type="button"
            onClick={() => setCountry("ALL")}
            className={`shrink-0 snap-start border px-3 py-1.5 text-[10px] uppercase tracking-widest transition ${
              country === "ALL"
                ? "border-yellow bg-yellow text-black"
                : "border-border text-dim hover:border-cyan hover:text-cyan"
            }`}
          >
            ALLA LAG
          </button>
          {countries.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCountry(c)}
              className={`shrink-0 inline-flex snap-start items-center gap-1 border px-2 py-1 text-[10px] uppercase tracking-widest transition ${
                country === c
                  ? "border-yellow bg-yellow text-black"
                  : "border-border text-dim hover:border-cyan hover:text-cyan"
              }`}
            >
              <Jersey code={c} size={16} />
              {c}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-[10px] uppercase tracking-widest text-dim">
            {visible.length} SPELARE
          </p>
          <div className="flex gap-1">
            {(["price", "name", "country"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setSort(k)}
                className={`border px-2 py-0.5 text-[10px] uppercase tracking-widest transition ${
                  sort === k
                    ? "border-cyan text-cyan"
                    : "border-border text-dim hover:border-cyan hover:text-cyan"
                }`}
              >
                {k === "price" ? "PRIS" : k === "name" ? "NAMN" : "LAND"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ul className="mt-1 divide-y divide-border border border-border">
        {visible.map((r) => (
          <li key={r.id}>
            <Link
              href={`/players/${r.id}`}
              className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-3 p-3 text-sm transition hover:bg-yellow/5"
            >
              <Jersey code={r.countryCode} size={28} />
              <span className="text-yellow tabular-nums">{r.position}</span>
              <span className="min-w-0">
                <span className="block truncate text-foreground">{r.name}</span>
                <span className="block text-[10px] uppercase tracking-widest text-dim">
                  {r.countryCode ?? "—"} · {r.clubShortName}
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
