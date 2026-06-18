/**
 * Pure round-statistics core for /vm/omgang/[n]. No DB — inputs in, stats out,
 * so it's unit-testable. The DB-backed assembler lives in round-stats-data.ts.
 *
 * Read-only: never touches game state. Only meaningful once a round has been
 * played (locked/scored) — the data layer enforces that gate.
 */

import type { Position } from "@/db/schema";
import { captainBonusSek } from "@/lib/scoring";
import { currentRules, formationToString } from "@/lib/rules";

export type RoundStatPlayer = {
  id: string;
  name: string;
  position: Position;
  countryCode: string | null;
  growthSek: number;
  priceSek: number;
  /** How many of OUR league's teams own this player this round (for the
   *  most-popular / most-unique XIs). Optional — only set where ownership is
   *  loaded. */
  ownerCount?: number;
};

/** One starting XI for the lineup preview (a real team's squad, or an optimal
 *  dream/nightmare XI). Players are split by row for the pitch render. */
export type RoundEleven = {
  GK: RoundStatPlayer[];
  DEF: RoundStatPlayer[];
  MID: RoundStatPlayer[];
  FWD: RoundStatPlayer[];
  captainId: string | null;
  /** "3-4-3" etc. */
  formation: string;
  /** Σ raw growth across the XI (the value the XI gained this round). */
  totalGrowthSek: number;
};

const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];

/**
 * Best (or worst) legal starting XI from a player pool, scored by round growth.
 * Budget-free — a hindsight "team of the round" / "nightmare XI". Tries every
 * legal formation and keeps the one whose top-k (or bottom-k) per position sum
 * to the most (max) / least (min) growth. Captain = the best (max) / worst (min)
 * grower in the chosen XI. Returns null if no legal XI fits (e.g. no GK).
 */
export function buildOptimalEleven(
  players: RoundStatPlayer[],
  dir: "max" | "min",
): RoundEleven | null {
  return buildElevenBy(players, (p) => p.growthSek, dir);
}

/**
 * Generalised version of buildOptimalEleven: builds the best (max) / worst
 * (min) legal XI ranked by an arbitrary per-player `weight`. Used for the
 * most-popular (max ownership) and most-unique (min ownership) XIs. Captain =
 * the most-extreme-by-weight player in the chosen XI. `totalGrowthSek` always
 * reports the XI's Σ growth (so the value column stays meaningful regardless of
 * what it was ranked by).
 */
export function buildElevenBy(
  players: RoundStatPlayer[],
  weight: (p: RoundStatPlayer) => number,
  dir: "max" | "min",
): RoundEleven | null {
  const sign = dir === "max" ? 1 : -1;
  const byPos: Record<Position, RoundStatPlayer[]> = {
    GK: [],
    DEF: [],
    MID: [],
    FWD: [],
  };
  for (const p of players) byPos[p.position].push(p);
  for (const k of POSITIONS) {
    byPos[k].sort((a, b) => sign * (weight(b) - weight(a)));
  }
  if (byPos.GK.length === 0) return null;

  const sumW = (xs: RoundStatPlayer[]) =>
    xs.reduce((acc, p) => acc + weight(p), 0);

  let best: {
    f: { def: number; mid: number; fwd: number };
    total: number;
  } | null = null;
  for (const f of currentRules.legalFormations) {
    if (
      byPos.DEF.length < f.def ||
      byPos.MID.length < f.mid ||
      byPos.FWD.length < f.fwd
    ) {
      continue;
    }
    const total =
      sumW(byPos.GK.slice(0, 1)) +
      sumW(byPos.DEF.slice(0, f.def)) +
      sumW(byPos.MID.slice(0, f.mid)) +
      sumW(byPos.FWD.slice(0, f.fwd));
    // Strictly better in the chosen direction.
    if (best === null || sign * (total - best.total) > 0) best = { f, total };
  }
  if (best === null) return null;

  const { f } = best;
  const GK = byPos.GK.slice(0, 1);
  const DEF = byPos.DEF.slice(0, f.def);
  const MID = byPos.MID.slice(0, f.mid);
  const FWD = byPos.FWD.slice(0, f.fwd);
  const xi = [...GK, ...DEF, ...MID, ...FWD];
  const captain =
    [...xi].sort((a, b) => sign * (weight(b) - weight(a)))[0] ?? null;

  return {
    GK,
    DEF,
    MID,
    FWD,
    captainId: captain?.id ?? null,
    formation: formationToString({ def: f.def, mid: f.mid, fwd: f.fwd }),
    totalGrowthSek: sum(xi),
  };
}

/** Arrange a fixed set of 11 players (a real squad) into a RoundEleven by
 *  position, preserving the given captain. Players already form a legal XI. */
export function elevenFromSquad(
  players: RoundStatPlayer[],
  captainId: string | null,
): RoundEleven {
  const byPos: Record<Position, RoundStatPlayer[]> = {
    GK: [],
    DEF: [],
    MID: [],
    FWD: [],
  };
  for (const p of players) byPos[p.position].push(p);
  for (const k of POSITIONS) {
    byPos[k].sort((a, b) => b.growthSek - a.growthSek);
  }
  return {
    GK: byPos.GK,
    DEF: byPos.DEF,
    MID: byPos.MID,
    FWD: byPos.FWD,
    captainId,
    formation: formationToString({
      def: byPos.DEF.length,
      mid: byPos.MID.length,
      fwd: byPos.FWD.length,
    }),
    totalGrowthSek: sum(players),
  };
}

/** A team's round performance for best/worst-team ranking: Σ growth across the
 *  squad + the captain bonus (same value the projection/scoring credits). */
export function roundPerformanceSek(
  players: RoundStatPlayer[],
  captainId: string | null,
): number {
  const base = sum(players);
  const cap = players.find((p) => p.id === captainId);
  const bonus = cap
    ? captainBonusSek(
        cap.growthSek,
        currentRules.captainMultiplier,
        currentRules.captainBonusOnlyPositive,
      )
    : 0;
  return base + bonus;
}

function sum(players: RoundStatPlayer[]): number {
  return players.reduce((acc, p) => acc + p.growthSek, 0);
}
