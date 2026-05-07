"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Row = {
  id: string;
  name: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  countryCode: string | null;
  clubShortName: string;
  basePriceSek: number | null;
  manualOverrides: number;
};

const POSITIONS = ["ALL", "GK", "DEF", "MID", "FWD"] as const;

export function PlayerListClient({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<(typeof POSITIONS)[number]>("ALL");
  const [country, setCountry] = useState<string>("ALL");

  const countries = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.countryCode) s.add(r.countryCode);
    return Array.from(s).sort();
  }, [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (position !== "ALL" && r.position !== position) return false;
      if (country !== "ALL" && r.countryCode !== country) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, position, country]);

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
              className={`shrink-0 snap-start border px-3 py-1.5 text-[10px] uppercase tracking-widest transition ${
                country === c
                  ? "border-yellow bg-yellow text-black"
                  : "border-border text-dim hover:border-cyan hover:text-cyan"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[10px] uppercase tracking-widest text-dim">
        {visible.length} SPELARE
      </p>

      <ul className="mt-1 divide-y divide-border border border-border">
        {visible.map((r) => (
          <li key={r.id}>
            <Link
              href={`/admin/players/${r.id}`}
              className="grid grid-cols-[auto_1fr_auto_auto] items-baseline gap-3 p-3 text-sm transition hover:bg-yellow/5"
            >
              <span className="text-yellow">{r.position}</span>
              <span className="min-w-0">
                <span className="truncate text-foreground">{r.name}</span>
                <span className="ml-2 text-[10px] uppercase tracking-widest text-dim">
                  {r.countryCode ?? "—"} · {r.clubShortName}
                </span>
              </span>
              <span className="tabular-nums text-foreground">
                {r.basePriceSek === null
                  ? "—"
                  : `${(r.basePriceSek / 1_000_000).toFixed(1)}M`}
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
