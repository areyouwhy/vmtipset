"use client";

import { useMemo, useState, useTransition } from "react";
import type { Position } from "@/db/schema";
import {
  summarize,
  validateSquad,
  type SquadCandidate,
} from "@/lib/squad";
import {
  currentRules,
  formationToString,
  type Formation,
} from "@/lib/rules";
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
  const [teamFilter, setTeamFilter] = useState<string>("ALL");
  const [onlyAffordable, setOnlyAffordable] = useState(false);
  const [onlyFits, setOnlyFits] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [view, setView] = useState<"plan" | "lista">("plan");
  const [formation, setFormation] = useState<Formation>(
    () => currentRules.legalFormations.find((f) => f.def === 4 && f.mid === 3 && f.fwd === 3) ?? currentRules.legalFormations[0],
  );
  // When user clicks an empty pitch slot we jump to LISTA filtered by that
  // position; pickedSlotPosition lets us auto-return to PLAN once they pick.
  const [pickedSlotPosition, setPickedSlotPosition] = useState<Position | null>(null);
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

  // Why a player can't be added right now (null = pickable). Selected players
  // are always pickable in the UI sense — the toggle is "remove".
  function reasonNotPickable(p: PickablePlayer): string | null {
    if (selected.has(p.id)) return null;
    if (p.priceSek > summary.remainingBudgetSek) return "EJ RÅD";
    const range = currentRules.positions[p.position];
    if (summary.byPosition[p.position] >= range.max) return "POSITION FULL";
    if (p.clubExternalId) {
      const c = summary.byClub[p.clubExternalId] ?? 0;
      if (c >= currentRules.maxFromSameClub) return "KLUBB MAX";
    }
    if (currentRules.maxFromSameCountry !== null && p.countryCode) {
      const c = summary.byCountry[p.countryCode] ?? 0;
      if (c >= currentRules.maxFromSameCountry) return "LAND MAX";
    }
    return null;
  }

  const visiblePlayers = useMemo(() => {
    return players.filter((p) => {
      if (filter !== "ALL" && p.position !== filter) return false;
      if (teamFilter !== "ALL" && p.countryCode !== teamFilter) return false;
      if (onlyAffordable) {
        const isSel = selected.has(p.id);
        if (!isSel && p.priceSek > summary.remainingBudgetSek) return false;
      }
      if (onlyFits) {
        if (reasonNotPickable(p) !== null) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, filter, teamFilter, onlyAffordable, onlyFits, selected, summary]);

  const teamsInOrder = useMemo(() => {
    const seen = new Set<string>();
    for (const p of players) if (p.countryCode) seen.add(p.countryCode);
    return Array.from(seen).sort();
  }, [players]);

  const selectedPlayers = useMemo(
    () =>
      Array.from(selected).flatMap((id) => {
        const p = playersById.get(id);
        return p ? [p] : [];
      }),
    [selected, playersById],
  );

  function toggle(id: string) {
    if (locked) return;
    setSavedAt(null);
    let added = false;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (captainId === id) setCaptainId(null);
      } else {
        next.add(id);
        added = true;
      }
      return next;
    });
    // If user came from clicking a pitch slot, return to pitch on add.
    if (added && pickedSlotPosition !== null) {
      setPickedSlotPosition(null);
      setView("plan");
    }
  }

  function openSlotPicker(pos: Position) {
    if (locked) return;
    setFilter(pos);
    setTeamFilter("ALL");
    setPickedSlotPosition(pos);
    setView("lista");
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

  const captainName = captainId
    ? (playersById.get(captainId)?.name ?? null)
    : null;
  const overBudget = summary.remainingBudgetSek < 0;
  const fullSquad = summary.count === currentRules.squadSize;

  return (
    <div className="pb-24">
      {/* Compact sticky summary */}
      <section className="sticky top-0 z-20 -mx-4 border-y border-border bg-background px-4 py-2 sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-3 text-xs tabular-nums">
          <span>
            <span className="text-dim">TRUPP </span>
            <span className={fullSquad ? "text-green" : "text-yellow"}>
              {summary.count}/{currentRules.squadSize}
            </span>
          </span>
          <span>
            <span className="text-dim">FORM </span>
            <span className="text-yellow">
              {summary.byPosition.GK === 1 ? formationStr : "—"}
            </span>
          </span>
          <span>
            <span className="text-dim">KVAR </span>
            <span className={overBudget ? "text-red" : "text-green"}>
              {(summary.remainingBudgetSek / 1_000_000).toFixed(1)}M
            </span>
          </span>
          <span className="truncate">
            <span className="text-dim">© </span>
            <span className="text-yellow">{captainName ?? "—"}</span>
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-[10px] tabular-nums">
          {(["GK", "DEF", "MID", "FWD"] as const).map((pos) => {
            const range = currentRules.positions[pos];
            const v = summary.byPosition[pos];
            const ok = v >= range.min && v <= range.max;
            return (
              <span key={pos}>
                <span className="text-dim">{pos} </span>
                <span className={ok ? "text-green" : "text-yellow"}>
                  {v}/{range.min === range.max ? range.min : `${range.min}-${range.max}`}
                </span>
              </span>
            );
          })}
        </div>
        {liveErrors.length > 0 && !locked && (
          <button
            type="button"
            onClick={() => setShowErrors((v) => !v)}
            className="mt-1 w-full text-left text-[10px] uppercase tracking-widest text-red"
          >
            ! {liveErrors.length} FEL — {showErrors ? "DÖLJ" : "VISA"}
          </button>
        )}
        {showErrors && liveErrors.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-[11px] text-yellow">
            {liveErrors.map((e, i) => (
              <li key={i}>· {e}</li>
            ))}
          </ul>
        )}
      </section>

      {/* View tabs */}
      <div className="mt-4 grid grid-cols-2 border border-border">
        <button
          type="button"
          onClick={() => {
            setPickedSlotPosition(null);
            setView("plan");
          }}
          className={`px-3 py-2 text-xs uppercase tracking-widest transition ${
            view === "plan"
              ? "bg-yellow text-black"
              : "text-dim hover:text-cyan"
          }`}
        >
          PLAN
        </button>
        <button
          type="button"
          onClick={() => {
            setPickedSlotPosition(null);
            setFilter("ALL");
            setView("lista");
          }}
          className={`px-3 py-2 text-xs uppercase tracking-widest transition ${
            view === "lista"
              ? "bg-yellow text-black"
              : "text-dim hover:text-cyan"
          }`}
        >
          LISTA
        </button>
      </div>

      {view === "plan" && (
        <PitchView
          selectedPlayers={selectedPlayers}
          captainId={captainId}
          locked={locked}
          formation={formation}
          onChangeFormation={setFormation}
          onRemove={toggle}
          onSetCaptain={setCaptain}
          onOpenSlot={openSlotPicker}
        />
      )}

      {view === "lista" && pickedSlotPosition !== null && (
        <p className="mt-3 border border-cyan bg-cyan/10 px-3 py-2 text-xs uppercase tracking-widest text-cyan">
          VÄLJ EN {pickedSlotPosition} — DU FÖRS TILLBAKA TILL PLAN
        </p>
      )}

      {view === "lista" && (
        <>
          {/* Filters */}
          <div className="mt-4 space-y-2">
            <FilterRow
              label="POSITION"
              options={POSITION_FILTERS.map((f) => ({
                value: f,
                label: f === "ALL" ? "ALLA" : f,
              }))}
              value={filter}
              onChange={(v) => setFilter(v as "ALL" | Position)}
            />
            <FilterRow
              label="LAG"
              options={[
                { value: "ALL", label: "ALLA" },
                ...teamsInOrder.map((c) => ({ value: c, label: c })),
              ]}
              value={teamFilter}
              onChange={setTeamFilter}
            />
            <div className="flex flex-wrap gap-2">
              <ToggleChip
                on={onlyAffordable}
                onChange={() => setOnlyAffordable((v) => !v)}
                label="BARA RÅD"
              />
              <ToggleChip
                on={onlyFits}
                onChange={() => setOnlyFits((v) => !v)}
                label="BARA PLATS"
              />
            </div>
          </div>

          <p className="mt-3 text-[10px] uppercase tracking-widest text-dim">
            {visiblePlayers.length} SPELARE
          </p>

          <ul className="mt-1 divide-y divide-border border border-border">
            {visiblePlayers.map((p) => {
              const isSel = selected.has(p.id);
              const reason = reasonNotPickable(p);
              return (
                <PlayerRow
                  key={p.id}
                  player={p}
                  selected={isSel}
                  isCaptain={captainId === p.id}
                  disabled={locked || (!isSel && reason !== null)}
                  reason={reason}
                  onToggle={() => toggle(p.id)}
                  onCaptain={() => setCaptain(p.id)}
                />
              );
            })}
            {visiblePlayers.length === 0 && (
              <li className="p-4 text-center text-sm text-dim">
                — inga matcher —
              </li>
            )}
          </ul>
        </>
      )}

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

      {/* Sticky save bar at viewport bottom */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background px-4 py-3 sm:px-6">
        <div className="mx-auto w-full max-w-3xl">
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
    </div>
  );
}

function PitchView({
  selectedPlayers,
  captainId,
  locked,
  formation,
  onChangeFormation,
  onRemove,
  onSetCaptain,
  onOpenSlot,
}: {
  selectedPlayers: PickablePlayer[];
  captainId: string | null;
  locked: boolean;
  formation: Formation;
  onChangeFormation: (f: Formation) => void;
  onRemove: (id: string) => void;
  onSetCaptain: (id: string) => void;
  onOpenSlot: (pos: Position) => void;
}) {
  const byPos = (p: Position) =>
    selectedPlayers.filter((pl) => pl.position === p);

  const slotsByPos: Record<Position, number> = {
    GK: 1,
    DEF: formation.def,
    MID: formation.mid,
    FWD: formation.fwd,
  };

  // Top → bottom: GK end at top (defending-up), FWD at bottom (attacking).
  const rows: Position[] = ["GK", "DEF", "MID", "FWD"];

  return (
    <div className="mt-4">
      {/* Formation selector */}
      <div className="mb-2 -mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1">
        {currentRules.legalFormations.map((f) => {
          const active =
            f.def === formation.def &&
            f.mid === formation.mid &&
            f.fwd === formation.fwd;
          return (
            <button
              key={formationToString(f)}
              type="button"
              onClick={() => onChangeFormation(f)}
              className={`shrink-0 snap-start border px-3 py-1.5 text-[10px] uppercase tracking-widest transition tabular-nums ${
                active
                  ? "border-yellow bg-yellow text-black"
                  : "border-border text-dim hover:border-cyan hover:text-cyan"
              }`}
            >
              {formationToString(f)}
            </button>
          );
        })}
      </div>

      <div
        className="border border-yellow/40 p-3"
        style={{
          background:
            "repeating-linear-gradient(0deg, rgba(0,255,0,0.04) 0 24px, rgba(0,255,0,0.08) 24px 48px)",
        }}
      >
        {/* Top goal box (GK end) — decorative */}
        <div className="mx-auto mb-2 h-5 w-2/3 border-x-2 border-b-2 border-yellow/30" />

        <div className="flex flex-col gap-3">
          {rows.map((pos) => {
            const players = byPos(pos);
            const targetSlots = slotsByPos[pos];
            const empties = Math.max(0, targetSlots - players.length);
            return (
              <div
                key={pos}
                className="flex min-h-[88px] items-start justify-around gap-1"
              >
                {players.map((p) => (
                  <PitchChip
                    key={p.id}
                    player={p}
                    isCaptain={captainId === p.id}
                    locked={locked}
                    onRemove={() => onRemove(p.id)}
                    onSetCaptain={() => onSetCaptain(p.id)}
                  />
                ))}
                {Array.from({ length: empties }).map((_, i) => (
                  <EmptySlot
                    key={`${pos}-empty-${i}`}
                    pos={pos}
                    locked={locked}
                    onClick={() => onOpenSlot(pos)}
                  />
                ))}
              </div>
            );
          })}
        </div>

        {/* Bottom goal box (attacking end) — decorative */}
        <div className="mx-auto mt-2 h-5 w-2/3 border-x-2 border-t-2 border-yellow/30" />
      </div>
    </div>
  );
}

function PitchChip({
  player,
  isCaptain,
  locked,
  onRemove,
  onSetCaptain,
}: {
  player: PickablePlayer;
  isCaptain: boolean;
  locked: boolean;
  onRemove: () => void;
  onSetCaptain: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
      <div className="relative">
        <button
          type="button"
          onClick={onSetCaptain}
          disabled={locked}
          className="relative flex h-12 w-14 items-center justify-center border-2 border-yellow bg-background text-base font-bold tabular-nums text-yellow transition hover:border-cyan disabled:cursor-not-allowed"
          title="Sätt som kapten"
          aria-label={`Sätt ${player.name} som kapten`}
        >
          {player.countryCode ?? "—"}
        </button>
        <span className="absolute -left-1 -top-1 border border-yellow bg-background px-1 text-[8px] uppercase tracking-widest text-yellow">
          {player.position}
        </span>
        {isCaptain && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center border border-yellow bg-yellow text-[9px] font-bold text-black">
            C
          </span>
        )}
        <button
          type="button"
          onClick={onRemove}
          disabled={locked}
          className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center border border-red bg-background text-[10px] leading-none text-red transition hover:bg-red hover:text-black disabled:opacity-50"
          aria-label={`Ta bort ${player.name}`}
          title="Ta bort"
        >
          ×
        </button>
      </div>
      <span className="line-clamp-1 max-w-[64px] text-[10px] leading-tight text-foreground">
        {player.name}
      </span>
      <span className="text-[10px] tabular-nums text-dim">
        {(player.priceSek / 1_000_000).toFixed(1)}M
      </span>
    </div>
  );
}

function EmptySlot({
  pos,
  locked,
  onClick,
}: {
  pos: Position;
  locked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locked}
      className="flex min-w-0 flex-1 flex-col items-center gap-0.5 disabled:cursor-not-allowed disabled:opacity-50"
      aria-label={`Lägg till ${pos}`}
    >
      <div className="flex h-12 w-14 items-center justify-center border-2 border-dashed border-yellow/50 text-yellow/70 transition hover:border-yellow hover:text-yellow">
        +
      </div>
      <span className="text-[10px] uppercase tracking-widest text-dim">
        {pos}
      </span>
    </button>
  );
}

function FilterRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[10px] uppercase tracking-widest text-dim">
        {label}
      </p>
      <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`shrink-0 snap-start border px-3 py-1.5 text-[10px] uppercase tracking-widest transition ${
              value === opt.value
                ? "border-yellow bg-yellow text-black"
                : "border-border text-dim hover:border-cyan hover:text-cyan"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToggleChip({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-pressed={on}
      className={`border px-3 py-1.5 text-[10px] uppercase tracking-widest transition ${
        on
          ? "border-cyan bg-cyan text-black"
          : "border-border text-dim hover:border-cyan hover:text-cyan"
      }`}
    >
      {on ? "✓" : "○"} {label}
    </button>
  );
}

function PlayerRow({
  player,
  selected,
  isCaptain,
  disabled,
  reason,
  onToggle,
  onCaptain,
}: {
  player: PickablePlayer;
  selected: boolean;
  isCaptain: boolean;
  disabled: boolean;
  reason: string | null;
  onToggle: () => void;
  onCaptain: () => void;
}) {
  const greyed = !selected && reason !== null;
  return (
    <li
      className={`grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 p-3 transition-opacity ${greyed ? "opacity-40" : ""}`}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className={`h-7 w-7 border text-center text-xs leading-none ${
          selected
            ? "border-yellow bg-yellow text-black"
            : "border-border text-dim"
        } disabled:cursor-not-allowed`}
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
          {player.countryCode ?? "—"}
          {" · "}
          {player.clubShortName}
          {greyed && reason && (
            <span className="ml-2 text-red">! {reason}</span>
          )}
        </p>
      </div>
      <span className="tabular-nums text-sm text-foreground">
        {(player.priceSek / 1_000_000).toFixed(1)}M
      </span>
      <button
        type="button"
        onClick={onCaptain}
        disabled={disabled}
        className={`h-7 w-7 border text-center text-[10px] leading-none ${
          isCaptain
            ? "border-yellow bg-yellow text-black"
            : "border-border text-dim hover:border-yellow hover:text-yellow"
        } disabled:cursor-not-allowed`}
        aria-label="Sätt som kapten"
        title="Kapten"
      >
        C
      </button>
    </li>
  );
}
