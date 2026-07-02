/**
 * Table-position history for the /vm/omgang bump chart.
 *
 * Pure derivation from the Leaderboard shape — no DB access of its own, so it
 * inherits getLeaderboard's caching and anti-cheat gates. Rank at round N is
 * by cumulative scored points through N, which orders identically to team
 * value (everyone starts from the same budget). The final "NU" tick is the
 * live leaderboard rank (includes the in-round projection).
 */

import { splitIntoThirds } from "./banter";
import type { Leaderboard } from "./leaderboard";

export type PositionTier = 1 | 2 | 3;

export type PositionSeries = {
  teamId: string;
  teamName: string;
  /** Which /tabell sida the team is on RIGHT NOW (colors the whole line). */
  tier: PositionTier;
  currentRank: number;
  /** Rank per tick, aligned with PositionHistory.ticks. */
  ranks: number[];
};

export type PositionStats = {
  bestClimb: { teamName: string; delta: number; tick: string } | null;
  worstFall: { teamName: string; delta: number; tick: string } | null;
  mostAtTop: { teamName: string; count: number } | null;
  bestRound: { teamName: string; pointsSek: number; roundNumber: number } | null;
};

export type PositionHistory = {
  /** X axis: one per scored round ("R1"…) plus a live "NU" tick. */
  ticks: string[];
  /** Sorted by current rank. */
  teams: PositionSeries[];
  stats: PositionStats;
};

/** Tie-aware ranks (1, 2, 2, 4) from a points map — same rule as the tabell. */
function tieRanks(totals: Map<string, number>): Map<string, number> {
  const entries = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const ranks = new Map<string, number>();
  let lastPoints: number | null = null;
  let lastRank = 0;
  for (let i = 0; i < entries.length; i++) {
    const [id, pts] = entries[i];
    if (pts !== lastPoints) {
      lastRank = i + 1;
      lastPoints = pts;
    }
    ranks.set(id, lastRank);
  }
  return ranks;
}

export function buildPositionHistory(lb: Leaderboard): PositionHistory | null {
  const scoredRounds = lb.rounds.filter((r) => r.isScored);
  if (scoredRounds.length === 0 || lb.rows.length === 0) return null;

  // Cumulative points → rank per scored round.
  const ticks: string[] = [];
  const ranksPerTick: Map<string, number>[] = [];
  const cumulative = new Map<string, number>(lb.rows.map((r) => [r.teamId, 0]));
  for (const round of scoredRounds) {
    for (const row of lb.rows) {
      const pts =
        row.perRound.find((p) => p.roundId === round.id)?.pointsSek ?? 0;
      cumulative.set(row.teamId, (cumulative.get(row.teamId) ?? 0) + pts);
    }
    ticks.push(`R${round.number}`);
    ranksPerTick.push(tieRanks(cumulative));
  }

  // Live tick from the leaderboard's own current rank (incl. projections).
  ticks.push("NU");
  ranksPerTick.push(new Map(lb.rows.map((r) => [r.teamId, r.rank])));

  // Current sida per team: same thirds split /tabell uses.
  const sorted = [...lb.rows].sort(
    (a, b) => a.rank - b.rank || b.totalPointsSek - a.totalPointsSek,
  );
  const thirds = splitIntoThirds(sorted);
  const tierByTeam = new Map<string, PositionTier>();
  thirds.forEach((third, i) => {
    for (const row of third) tierByTeam.set(row.teamId, (i + 1) as PositionTier);
  });

  const teams: PositionSeries[] = sorted.map((row) => ({
    teamId: row.teamId,
    teamName: row.teamName,
    tier: tierByTeam.get(row.teamId) ?? 3,
    currentRank: row.rank,
    ranks: ranksPerTick.map((m) => m.get(row.teamId) ?? sorted.length),
  }));

  return { ticks, teams, stats: buildStats(lb, ticks, teams) };
}

function buildStats(
  lb: Leaderboard,
  ticks: string[],
  teams: PositionSeries[],
): PositionStats {
  let bestClimb: PositionStats["bestClimb"] = null;
  let worstFall: PositionStats["worstFall"] = null;
  let mostAtTop: PositionStats["mostAtTop"] = null;

  for (const t of teams) {
    for (let i = 1; i < t.ranks.length; i++) {
      const delta = t.ranks[i - 1] - t.ranks[i]; // positive = climbed
      if (delta > 0 && (!bestClimb || delta > bestClimb.delta)) {
        bestClimb = { teamName: t.teamName, delta, tick: ticks[i] };
      }
      if (delta < 0 && (!worstFall || delta < worstFall.delta)) {
        worstFall = { teamName: t.teamName, delta, tick: ticks[i] };
      }
    }
    const count = t.ranks.filter((r) => r === 1).length;
    if (count > 0 && (!mostAtTop || count > mostAtTop.count)) {
      mostAtTop = { teamName: t.teamName, count };
    }
  }

  let bestRound: PositionStats["bestRound"] = null;
  for (const row of lb.rows) {
    for (const p of row.perRound) {
      if (p.pointsSek === null) continue;
      if (!bestRound || p.pointsSek > bestRound.pointsSek) {
        bestRound = {
          teamName: row.teamName,
          pointsSek: p.pointsSek,
          roundNumber: p.roundNumber,
        };
      }
    }
  }

  return { bestClimb, worstFall, mostAtTop, bestRound };
}
