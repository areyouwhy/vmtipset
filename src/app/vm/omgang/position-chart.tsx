"use client";

import { useState, useSyncExternalStore } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  PositionHistory,
  PositionSeries,
  PositionTier,
} from "@/lib/position-history";
import { useMyTeamId } from "./use-my-team";

const TIER_COLOR: Record<PositionTier, string> = {
  1: "#00ff00",
  2: "#00ffff",
  3: "#ff0000",
};
const MY_COLOR = "#ffff00";
const GHOST_COLOR = "#3f3f3f";
const TIER_LABEL: Record<PositionTier, string> = {
  1: "SIDA 1",
  2: "SIDA 2",
  3: "SIDA 3",
};
const AXIS = "#888888";
const BORDER = "#2a2a2a";

/**
 * Which lines are in full color. Everything else stays as a dim ghost so the
 * overview shape survives — crucial on mobile where 31 lines are unreadable.
 */
type FocusMode = "alla" | "runt" | "topp" | "sida1" | "sida2" | "sida3";

function modeFocus(
  mode: FocusMode,
  teams: PositionSeries[],
  myId: string | null,
): Set<string> {
  const mine = myId ? teams.find((t) => t.teamId === myId) : undefined;
  const ids = new Set<string>();
  for (const t of teams) {
    const inMode =
      mode === "alla"
        ? true
        : mode === "topp"
          ? t.currentRank <= 10
          : mode === "runt"
            ? mine
              ? t.currentRank <= 3 ||
                Math.abs(t.currentRank - mine.currentRank) <= 2
              : t.currentRank <= 10
            : t.tier === Number(mode.slice(4));
    if (inMode) ids.add(t.teamId);
  }
  if (myId) ids.add(myId); // my line is always lit
  return ids;
}

/** Sparse Y labels (1, 5, 10, … , last) — the chart is too short for all 31. */
function yTicks(count: number): number[] {
  const ticks = new Set<number>([1, count]);
  for (let i = 5; i < count; i += 5) ticks.add(i);
  return [...ticks].sort((a, b) => a - b);
}

// Small screens get a focused default instead of all 31 lines.
const NARROW_QUERY = "(max-width: 639px)";
function subscribeNarrow(cb: () => void): () => void {
  const mq = window.matchMedia(NARROW_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function readNarrow(): boolean {
  return window.matchMedia(NARROW_QUERY).matches;
}

export function PositionChart({
  history,
  authedTeamId = null,
}: {
  history: PositionHistory;
  authedTeamId?: string | null;
}) {
  const { ticks, teams } = history;
  const [hovered, setHovered] = useState<string | null>(null);
  // Per-team override from legend taps: true = force lit, false = force ghost.
  const [override, setOverride] = useState<ReadonlyMap<string, boolean>>(
    new Map(),
  );
  const [modeChoice, setModeChoice] = useState<FocusMode | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const myId = useMyTeamId(authedTeamId);
  const isNarrow = useSyncExternalStore(subscribeNarrow, readNarrow, () => false);

  const mode: FocusMode = modeChoice ?? (isNarrow ? "topp" : "alla");
  const focusByMode = modeFocus(mode, teams, myId);
  const isLit = (id: string) => override.get(id) ?? focusByMode.has(id);
  const colorFor = (t: PositionSeries) =>
    t.teamId === myId ? MY_COLOR : TIER_COLOR[t.tier];

  const pickMode = (m: FocusMode) => {
    setModeChoice(m);
    setOverride(new Map());
    setHovered(null);
  };
  const toggleTeam = (id: string) => {
    setHovered((h) => (h === id ? null : h));
    setOverride((prev) => new Map(prev).set(id, !isLit(id)));
  };

  const data = ticks.map((tick, i) => {
    const row: Record<string, number | string> = { tick };
    for (const t of teams) row[t.teamId] = t.ranks[i];
    return row;
  });
  const nameById = new Map(teams.map((t) => [t.teamId, t.teamName]));
  const tierById = new Map(teams.map((t) => [t.teamId, t.tier]));
  const litIds = new Set(teams.filter((t) => isLit(t.teamId)).map((t) => t.teamId));

  const chips: { key: FocusMode; label: string; swatch?: string; active: string }[] =
    [
      ...(myId
        ? [{ key: "runt" as const, label: "RUNT MIG", active: "bg-yellow text-black" }]
        : []),
      { key: "topp", label: "TOPP 10", active: "bg-foreground text-black" },
      ...([1, 2, 3] as const).map((tier) => ({
        key: `sida${tier}` as FocusMode,
        label: TIER_LABEL[tier],
        swatch: TIER_COLOR[tier],
        active: "bg-foreground text-black",
      })),
      { key: "alla", label: "ALLA", active: "bg-foreground text-black" },
    ];

  return (
    <div>
      {/* View chips: what's lit; the rest stays as dim ghosts for context. */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-widest">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => pickMode(c.key)}
            className={`flex items-center gap-1.5 border border-border px-2 py-0.5 transition ${
              mode === c.key
                ? c.active
                : "text-foreground hover:border-dim"
            }`}
          >
            {c.swatch && (
              <span
                className="inline-block h-2 w-2"
                style={{ background: mode === c.key ? "#000" : c.swatch }}
              />
            )}
            {c.label}
          </button>
        ))}
      </div>

      <ResponsiveContainer
        width="100%"
        height={Math.min(460, Math.max(280, teams.length * 14))}
      >
        <LineChart data={data} margin={{ top: 8, right: 10, bottom: 0, left: -22 }}>
          <CartesianGrid stroke={BORDER} strokeDasharray="1 3" horizontal vertical={false} />
          <XAxis
            dataKey="tick"
            tick={{ fill: AXIS, fontSize: 9 }}
            axisLine={{ stroke: BORDER }}
            tickLine={false}
          />
          <YAxis
            reversed
            domain={[1, teams.length]}
            ticks={yTicks(teams.length)}
            interval={0}
            tick={{ fill: AXIS, fontSize: 9 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={(props) => (
              <PositionTooltip
                {...props}
                nameById={nameById}
                tierById={tierById}
                myId={myId}
                litIds={litIds}
              />
            )}
            cursor={{ stroke: BORDER }}
          />
          {/* Ghosts first, lit lines after, my line last → sane z-order. */}
          {[...teams]
            .sort((a, b) => {
              const za = a.teamId === myId ? 2 : isLit(a.teamId) ? 1 : 0;
              const zb = b.teamId === myId ? 2 : isLit(b.teamId) ? 1 : 0;
              return za - zb;
            })
            .map((t) => {
              const isMine = t.teamId === myId;
              // Legend hover temporarily lights a ghost.
              const lit = isLit(t.teamId) || hovered === t.teamId;
              const color = lit ? colorFor(t) : GHOST_COLOR;
              return (
                <Line
                  key={t.teamId}
                  dataKey={t.teamId}
                  name={t.teamName}
                  type="linear"
                  stroke={color}
                  strokeWidth={
                    (isMine && lit) || hovered === t.teamId ? 2.5 : lit ? 1.5 : 1
                  }
                  strokeOpacity={
                    lit && hovered !== null && hovered !== t.teamId ? 0.15 : 1
                  }
                  dot={lit ? { r: isMine ? 3 : 2, fill: color, strokeWidth: 0 } : false}
                  activeDot={lit ? { r: 4, fill: color, stroke: "#000" } : false}
                  isAnimationActive={false}
                />
              );
            })}
        </LineChart>
      </ResponsiveContainer>

      {/* Legend: current table order. Tap to light/dim a line, hover to isolate.
          On phones only the lit teams show until expanded — 31 rows is a wall. */}
      <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
        {(!isNarrow || legendOpen
          ? teams
          : teams.filter((t) => isLit(t.teamId))
        ).map((t) => {
          const lit = isLit(t.teamId);
          const isMine = t.teamId === myId;
          const color = colorFor(t);
          return (
            <button
              key={t.teamId}
              type="button"
              onClick={() => toggleTeam(t.teamId)}
              onMouseEnter={() => setHovered(t.teamId)}
              onMouseLeave={() => setHovered(null)}
              className={`flex items-center gap-2 py-0.5 text-left text-[10px] uppercase tracking-widest transition-opacity ${
                lit && hovered !== null && hovered !== t.teamId ? "opacity-40" : ""
              }`}
            >
              <span
                className="inline-block h-2 w-2 shrink-0 border"
                style={{
                  borderColor: lit ? color : GHOST_COLOR,
                  background: lit ? color : "transparent",
                }}
              />
              <span className="w-6 shrink-0 text-right tabular-nums text-dim">
                {String(t.currentRank).padStart(2, "0")}
              </span>
              <span
                className={`truncate ${
                  lit ? (isMine ? "text-yellow" : "text-foreground") : "text-dim"
                }`}
              >
                {t.teamName}
              </span>
              {isMine && (
                <span className="shrink-0 bg-yellow px-1 text-[8px] font-bold text-black">
                  DU
                </span>
              )}
            </button>
          );
        })}
      </div>
      {isNarrow && (
        <button
          type="button"
          onClick={() => setLegendOpen((o) => !o)}
          className="mt-2 border border-border px-2 py-1 text-[10px] uppercase tracking-widest text-dim hover:text-foreground"
        >
          {legendOpen ? "[ FÄRRE LAG ]" : `[ VISA ALLA ${teams.length} LAG ]`}
        </button>
      )}
      <p className="mt-2 text-[9px] uppercase tracking-widest text-dim">
        FÄRG = NUVARANDE SIDA{myId && " · GUL = DITT LAG"} · Y = PLACERING ·
        TRYCK PÅ ETT LAG FÖR ATT TÄNDA/SLÄCKA
      </p>
    </div>
  );
}

type TooltipEntry = { dataKey?: unknown; value?: unknown };

function PositionTooltip({
  active,
  payload,
  label,
  nameById,
  tierById,
  myId,
  litIds,
}: {
  active?: boolean;
  payload?: ReadonlyArray<TooltipEntry>;
  label?: string | number;
  nameById: Map<string, string>;
  tierById: Map<string, PositionTier>;
  myId: string | null;
  litIds: ReadonlySet<string>;
}) {
  if (!active || !payload) return null;
  const sorted = payload
    .filter((p) => litIds.has(String(p.dataKey)))
    .sort((a, b) => Number(a.value) - Number(b.value));
  if (sorted.length === 0) return null;
  return (
    <div className="border border-border bg-black px-2 py-1.5 text-[10px] uppercase tracking-widest">
      <p className="mb-1 text-foreground">{label}</p>
      <div
        className={`grid gap-x-4 ${sorted.length > 12 ? "grid-cols-2" : "grid-cols-1"}`}
      >
        {sorted.map((p) => {
          const id = String(p.dataKey);
          const isMine = id === myId;
          return (
            <p key={id} className="flex items-center gap-1.5 tabular-nums">
              <span
                className="inline-block h-1.5 w-1.5 shrink-0"
                style={{
                  background: isMine ? MY_COLOR : TIER_COLOR[tierById.get(id) ?? 3],
                }}
              />
              <span className="text-dim">{String(p.value).padStart(2, "0")}</span>
              <span
                className={`max-w-36 truncate ${isMine ? "text-yellow" : "text-foreground"}`}
              >
                {nameById.get(id)}
              </span>
            </p>
          );
        })}
      </div>
    </div>
  );
}
