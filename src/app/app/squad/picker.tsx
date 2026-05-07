"use client";

import { useMemo, useState, useTransition } from "react";
import type { Position } from "@/db/schema";
import {
  summarize,
  validateSquad,
  type SquadCandidate,
} from "@/lib/squad";
import { currentRules, formationToString } from "@/lib/rules";
import type { PickablePlayer } from "@/lib/squad-data";
import { saveSquadAction } from "./actions";

const POSITION_FILTERS: Array<"ALL" | Position> = [
  "ALL",
  "GK",
  "DEF",
  "MID",
  "FWD",
];

export function SquadPicker({
  players,
  initialPlayerIds,
  initialCaptainId,
  locked,
}: {
  players: PickablePlayer[];
  initialPlayerIds: string[];
  initialCaptainId: string | null;
  locked: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialPlayerIds),
  );
  const [captainId, setCaptainId] = useState<string | null>(initialCaptainId);
  const [filter, setFilter] = useState<"ALL" | Position>("ALL");
  const [clubFilter, setClubFilter] = useState<string>("ALL");
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<string[]>([]);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const playersById = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players],
  );

  const candidate: SquadCandidate = useMemo(
    () => ({
      players: Array.from(selected).flatMap((id) => {
        const p = playersById.get(id);
        return p
          ? [
              {
                id: p.id,
                position: p.position,
                clubExternalId: p.clubExternalId,
                countryCode: p.countryCode,
                priceSek: p.priceSek,
              },
            ]
          : [];
      }),
      captainPlayerId: captainId,
    }),
    [selected, captainId, playersById],
  );

  const summary = summarize(candidate);
  const liveErrors = validateSquad(candidate);

  const visiblePlayers = useMemo(() => {
    return players.filter((p) => {
      if (filter !== "ALL" && p.position !== filter) return false;
      if (clubFilter !== "ALL" && p.clubExternalId !== clubFilter) return false;
      return true;
    });
  }, [players, filter, clubFilter]);

  const clubsInOrder = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of players) {
      if (p.clubExternalId && !seen.has(p.clubExternalId)) {
        seen.set(p.clubExternalId, p.clubShortName);
      }
    }
    return Array.from(seen.entries());
  }, [players]);

  function toggle(id: string) {
    if (locked) return;
    setSavedAt(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (captainId === id) setCaptainId(null);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function setCaptain(id: string) {
    if (locked) return;
    setSavedAt(null);
    if (!selected.has(id)) {
      setSelected((prev) => new Set(prev).add(id));
    }
    setCaptainId(id);
  }

  function save() {
    setErrors([]);
    setSavedAt(null);
    startTransition(async () => {
      const result = await saveSquadAction(Array.from(selected), captainId);
      if (result.ok) {
        setSavedAt(Date.now());
      } else {
        setErrors(result.errors);
      }
    });
  }

  const formationStr = formationToString({
    def: summary.byPosition.DEF,
    mid: summary.byPosition.MID,
    fwd: summary.byPosition.FWD,
  });

  return (
    <div>
      <SummaryPanel
        summary={summary}
        formationStr={formationStr}
        captainName={
          captainId ? (playersById.get(captainId)?.name ?? null) : null
        }
        liveErrors={liveErrors}
        locked={locked}
      />

      <FilterBar
        filter={filter}
        setFilter={setFilter}
        clubFilter={clubFilter}
        setClubFilter={setClubFilter}
        clubs={clubsInOrder}
      />

      <ul className="divide-y divide-border border border-border">
        {visiblePlayers.map((p) => (
          <PlayerRow
            key={p.id}
            player={p}
            selected={selected.has(p.id)}
            isCaptain={captainId === p.id}
            disabled={locked}
            onToggle={() => toggle(p.id)}
            onCaptain={() => setCaptain(p.id)}
          />
        ))}
        {visiblePlayers.length === 0 && (
          <li className="p-4 text-center text-sm text-dim">— inga matcher —</li>
        )}
      </ul>

      {errors.length > 0 && (
        <ul className="mt-4 space-y-1 border border-red bg-red/10 px-3 py-2 text-sm text-red">
          {errors.map((e, i) => (
            <li key={i}>! {e}</li>
          ))}
        </ul>
      )}

      {savedAt && (
        <p className="mt-4 border border-green bg-green/10 px-3 py-2 text-sm text-green">
          ✓ TRUPPEN SPARAD
        </p>
      )}

      <div className="sticky bottom-4 mt-6">
        <button
          type="button"
          onClick={save}
          disabled={pending || locked || liveErrors.length > 0}
          className="w-full border border-yellow bg-yellow px-6 py-3 text-sm font-bold uppercase tracking-widest text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-border disabled:text-dim disabled:opacity-100"
        >
          {locked
            ? "[ TRUPPEN ÄR LÅST ]"
            : pending
              ? "[ SPARAR... ]"
              : liveErrors.length > 0
                ? `[ ${liveErrors.length} FEL KVAR ]`
                : "[ SPARA TRUPP → ]"}
        </button>
      </div>
    </div>
  );
}

function SummaryPanel({
  summary,
  formationStr,
  captainName,
  liveErrors,
  locked,
}: {
  summary: ReturnType<typeof summarize>;
  formationStr: string;
  captainName: string | null;
  liveErrors: string[];
  locked: boolean;
}) {
  const overBudget = summary.remainingBudgetSek < 0;
  return (
    <section className="border border-border p-4">
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-dim">
            TRUPP
          </p>
          <p className="mt-1 tabular-nums">
            <span className="text-yellow">{summary.count}</span>
            <span className="text-dim"> / {currentRules.squadSize}</span>
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-dim">
            FORMATION
          </p>
          <p className="mt-1 tabular-nums text-yellow">
            {summary.byPosition.GK === 1 ? formationStr : "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-dim">
            BUDGET KVAR
          </p>
          <p
            className={`mt-1 tabular-nums ${overBudget ? "text-red" : "text-green"}`}
          >
            {(summary.remainingBudgetSek / 1_000_000).toFixed(1)} M
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-dim">
            KAPTEN
          </p>
          <p className="mt-1 truncate text-yellow">{captainName ?? "—"}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-xs tabular-nums">
        {(["GK", "DEF", "MID", "FWD"] as const).map((pos) => {
          const range = currentRules.positions[pos];
          const v = summary.byPosition[pos];
          const ok = v >= range.min && v <= range.max;
          return (
            <div
              key={pos}
              className="flex items-center justify-between border border-border px-2 py-1"
            >
              <span className="text-dim">{pos}</span>
              <span className={ok ? "text-green" : "text-yellow"}>
                {v}
                <span className="text-dim">
                  {" "}
                  / {range.min}–{range.max}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      {liveErrors.length > 0 && !locked && (
        <ul className="mt-3 space-y-1 text-xs text-yellow">
          {liveErrors.slice(0, 3).map((e, i) => (
            <li key={i}>· {e}</li>
          ))}
          {liveErrors.length > 3 && (
            <li className="text-dim">+ {liveErrors.length - 3} fler...</li>
          )}
        </ul>
      )}
    </section>
  );
}

function FilterBar({
  filter,
  setFilter,
  clubFilter,
  setClubFilter,
  clubs,
}: {
  filter: "ALL" | Position;
  setFilter: (f: "ALL" | Position) => void;
  clubFilter: string;
  setClubFilter: (c: string) => void;
  clubs: [string, string][];
}) {
  return (
    <div className="mt-6 space-y-2">
      <div className="flex flex-wrap gap-2">
        {POSITION_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`border px-3 py-1.5 text-[10px] uppercase tracking-widest transition ${
              filter === f
                ? "border-yellow bg-yellow text-black"
                : "border-border text-dim hover:border-cyan hover:text-cyan"
            }`}
          >
            {f === "ALL" ? "ALLA" : f}
          </button>
        ))}
      </div>
      <select
        value={clubFilter}
        onChange={(e) => setClubFilter(e.target.value)}
        className="w-full border border-border bg-transparent px-3 py-2 text-sm text-foreground focus:border-yellow focus:outline-none sm:w-auto"
      >
        <option value="ALL">ALLA KLUBBAR</option>
        {clubs.map(([extId, label]) => (
          <option key={extId} value={extId}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

function PlayerRow({
  player,
  selected,
  isCaptain,
  disabled,
  onToggle,
  onCaptain,
}: {
  player: PickablePlayer;
  selected: boolean;
  isCaptain: boolean;
  disabled: boolean;
  onToggle: () => void;
  onCaptain: () => void;
}) {
  return (
    <li className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 p-3">
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className={`h-6 w-6 border text-center text-xs leading-none ${
          selected
            ? "border-yellow bg-yellow text-black"
            : "border-border text-dim"
        } disabled:opacity-50`}
        aria-label={selected ? "Ta bort" : "Lägg till"}
      >
        {selected ? "✓" : ""}
      </button>
      <div className="min-w-0">
        <p className="truncate text-sm">
          <span className="text-yellow">{player.position}</span>{" "}
          {player.name}
        </p>
        <p className="truncate text-[10px] uppercase tracking-widest text-dim">
          {player.clubShortName}
          {player.countryCode ? ` · ${player.countryCode}` : ""}
        </p>
      </div>
      <span className="tabular-nums text-sm text-foreground">
        {(player.priceSek / 1_000_000).toFixed(1)}M
      </span>
      <button
        type="button"
        onClick={onCaptain}
        disabled={disabled}
        className={`h-6 w-6 border text-center text-[10px] leading-none ${
          isCaptain
            ? "border-yellow bg-yellow text-black"
            : "border-border text-dim hover:border-yellow hover:text-yellow"
        } disabled:opacity-50`}
        aria-label="Sätt som kapten"
        title="Kapten"
      >
        C
      </button>
      <span aria-hidden className="sr-only">spacer</span>
    </li>
  );
}
