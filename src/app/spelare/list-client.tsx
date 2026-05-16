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

type SortKey =
  | "price"
  | "name"
  | "country"
  | "growth"
  | "latest"
  | "goals"
  | "assists"
  | "yellow"
  | "red"
  | "shots"
  | "saves"
  | "motm"
  | "pop";
type ViewMode = "list" | "table";

export function PublicPlayersList({ rows }: { rows: PlayerListRow[] }) {
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<PositionFilter>("ALL");
  const [country, setCountry] = useState<string>("ALL");
  const [club, setClub] = useState<string>("ALL");
  const [sort, setSort] = useState<SortKey>("price");
  const [view, setView] = useState<ViewMode>("list");

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
    if (sort === "latest") {
      return [...filtered].sort(
        (a, b) =>
          b.latestGrowthSek - a.latestGrowthSek ||
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
    if (sort === "assists") {
      return [...filtered].sort(
        (a, b) =>
          b.stats.assists - a.stats.assists ||
          b.stats.goals - a.stats.goals ||
          a.name.localeCompare(b.name),
      );
    }
    if (sort === "yellow") {
      return [...filtered].sort(
        (a, b) =>
          b.stats.yellowCards - a.stats.yellowCards ||
          a.name.localeCompare(b.name),
      );
    }
    if (sort === "red") {
      return [...filtered].sort(
        (a, b) =>
          b.stats.redCards - a.stats.redCards ||
          a.name.localeCompare(b.name),
      );
    }
    if (sort === "shots") {
      return [...filtered].sort(
        (a, b) =>
          b.stats.shotsOnGoal - a.stats.shotsOnGoal ||
          a.name.localeCompare(b.name),
      );
    }
    if (sort === "saves") {
      return [...filtered].sort(
        (a, b) =>
          b.stats.saves - a.stats.saves || a.name.localeCompare(b.name),
      );
    }
    if (sort === "motm") {
      return [...filtered].sort(
        (a, b) =>
          b.stats.manOfTheMatch - a.stats.manOfTheMatch ||
          a.name.localeCompare(b.name),
      );
    }
    if (sort === "pop") {
      return [...filtered].sort(
        (a, b) => b.popularity - a.popularity || a.name.localeCompare(b.name),
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

      <div className="mt-3 flex items-baseline justify-between text-[10px] uppercase tracking-widest text-dim">
        <span>{visible.length} SPELARE</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setView("list")}
            className={`border px-2 py-0.5 ${
              view === "list"
                ? "border-yellow bg-yellow text-black font-bold"
                : "border-border text-dim hover:border-cyan hover:text-cyan"
            }`}
          >
            LISTA
          </button>
          <button
            type="button"
            onClick={() => setView("table")}
            className={`border px-2 py-0.5 ${
              view === "table"
                ? "border-yellow bg-yellow text-black font-bold"
                : "border-border text-dim hover:border-cyan hover:text-cyan"
            }`}
          >
            TABELL
          </button>
        </div>
      </div>

      {view === "table" && (
        <StatsTable rows={visible} sort={sort} onSort={setSort} />
      )}

      {view === "list" && (
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
      )}
    </>
  );
}

function StatsTable({
  rows,
  sort,
  onSort,
}: {
  rows: PlayerListRow[];
  sort: SortKey;
  onSort: (k: SortKey) => void;
}) {
  return (
    <div className="mt-1 overflow-x-auto border border-border">
      <table className="w-full min-w-[820px] border-collapse text-[11px]">
        <thead className="bg-background text-[9px] uppercase tracking-widest text-dim">
          <tr className="border-b border-border">
            <Th align="right" w="w-8">
              #
            </Th>
            <Th align="left" sortKey="name" current={sort} onSort={onSort}>
              SPELARE
            </Th>
            <Th align="left" w="w-12" sortKey="country" current={sort} onSort={onSort}>
              LAND
            </Th>
            <Th align="center" w="w-10">
              POS
            </Th>
            <Th align="right" sortKey="price" current={sort} onSort={onSort}>
              VÄRDE
            </Th>
            <Th align="right" sortKey="growth" current={sort} onSort={onSort}>
              Δ TOT
            </Th>
            <Th align="right" sortKey="latest" current={sort} onSort={onSort}>
              Δ ROND
            </Th>
            <Th align="right" sortKey="goals" current={sort} onSort={onSort}>
              MÅL
            </Th>
            <Th align="right" sortKey="assists" current={sort} onSort={onSort}>
              ASS
            </Th>
            <Th align="right" sortKey="yellow" current={sort} onSort={onSort}>
              GUL
            </Th>
            <Th align="right" sortKey="red" current={sort} onSort={onSort}>
              RÖD
            </Th>
            <Th align="right" sortKey="shots" current={sort} onSort={onSort}>
              SK
            </Th>
            <Th align="right" sortKey="saves" current={sort} onSort={onSort}>
              RÄ
            </Th>
            <Th align="right" sortKey="motm" current={sort} onSort={onSort}>
              ⭐
            </Th>
            <Th align="right" sortKey="pop" current={sort} onSort={onSort}>
              POP
            </Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.map((r, i) => (
            <tr key={r.id} className="tabular-nums hover:bg-yellow/5">
              <td className="px-2 py-1.5 text-right text-dim">{i + 1}</td>
              <td className="min-w-0 px-2 py-1.5">
                <Link
                  href={`/spelare/${r.id}`}
                  className="block truncate text-foreground hover:text-cyan"
                >
                  {r.name}
                </Link>
                {r.domesticClub && (
                  <span className="block truncate text-[9px] uppercase tracking-widest text-cyan/70">
                    {r.domesticClub}
                  </span>
                )}
              </td>
              <td className="px-2 py-1.5 text-left text-dim">
                {r.countryCode ? (
                  <Link
                    href={`/landslag/${r.countryCode}`}
                    className="inline-flex items-center gap-1 hover:text-cyan"
                  >
                    <Jersey code={r.countryCode} size={16} />
                    {r.countryCode}
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Jersey code={r.countryCode} size={16} />—
                  </span>
                )}
              </td>
              <td className="px-2 py-1.5 text-center text-yellow">
                {r.position}
              </td>
              <td className="px-2 py-1.5 text-right text-foreground">
                {r.currentPriceSek === null
                  ? "—"
                  : `${(r.currentPriceSek / 1_000_000).toFixed(1)}M`}
              </td>
              <td
                className={`px-2 py-1.5 text-right ${toneClass(r.stats.totalGrowthSek)}`}
              >
                {r.stats.totalGrowthSek === 0
                  ? "—"
                  : fmtSekShort(r.stats.totalGrowthSek)}
              </td>
              <td
                className={`px-2 py-1.5 text-right ${toneClass(r.latestGrowthSek)}`}
              >
                {r.latestGrowthSek === 0 ? "—" : fmtSekShort(r.latestGrowthSek)}
              </td>
              <td className="px-2 py-1.5 text-right text-foreground">
                {r.stats.goals || "—"}
              </td>
              <td className="px-2 py-1.5 text-right text-foreground">
                {r.stats.assists || "—"}
              </td>
              <td className="px-2 py-1.5 text-right text-yellow">
                {r.stats.yellowCards || "—"}
              </td>
              <td className="px-2 py-1.5 text-right text-red">
                {r.stats.redCards || "—"}
              </td>
              <td className="px-2 py-1.5 text-right text-foreground">
                {r.stats.shotsOnGoal || "—"}
              </td>
              <td className="px-2 py-1.5 text-right text-foreground">
                {r.stats.saves || "—"}
              </td>
              <td className="px-2 py-1.5 text-right text-foreground">
                {r.stats.manOfTheMatch || "—"}
              </td>
              <td className="px-2 py-1.5 text-right text-dim">
                {r.popularity || "—"}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={15} className="px-2 py-3 text-center text-dim">
                — inga matcher —
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  align,
  w,
  sortKey,
  current,
  onSort,
}: {
  children: React.ReactNode;
  align: "left" | "center" | "right";
  w?: string;
  sortKey?: SortKey;
  current?: SortKey;
  onSort?: (k: SortKey) => void;
}) {
  const isActive = sortKey && current === sortKey;
  const alignClass =
    align === "left"
      ? "text-left"
      : align === "center"
        ? "text-center"
        : "text-right";
  const base = `${w ?? ""} px-2 py-1.5 ${alignClass} whitespace-nowrap`;
  if (!sortKey) {
    return <th className={base}>{children}</th>;
  }
  return (
    <th className={base}>
      <button
        type="button"
        onClick={() => onSort?.(sortKey)}
        className={`uppercase transition hover:text-cyan ${isActive ? "text-yellow font-bold" : ""}`}
      >
        {children}
        {isActive && <span className="ml-0.5">↓</span>}
      </button>
    </th>
  );
}

function toneClass(n: number): string {
  if (n > 0) return "text-green";
  if (n < 0) return "text-red";
  return "text-dim";
}
