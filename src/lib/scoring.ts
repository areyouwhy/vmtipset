import type { Position } from "@/db/schema";

/**
 * Pure scoring engine.
 *
 * Inputs in, score out. No DB calls inside. The whole point is that this
 * function can be unit-tested with hand-calculated expected values, and that
 * re-running it on the same inputs always produces the same outputs.
 *
 * Scoring formula matches `/hur`:
 *
 *   ROUND_POINTS =
 *     Σ (each player's price growth in this round)
 *     + (captain.growth × (multiplier − 1))   [floored at 0 if `captainBonusOnlyPositive`]
 *     + (leftover budget × bank-interest rate)
 *     − (sum of transfer fees this round)
 */

export type ScoringSquadPlayer = {
  id: string;
  position: Position;
};

export type ScoringSquad = {
  players: ScoringSquadPlayer[];
  captainPlayerId: string | null;
};

export type SnapshotForScoring = {
  snapshotId: string;
  priceSek: number;
  growthSek: number;
};

export type ScoringInputs = {
  squad: ScoringSquad;
  /** snapshot for this round, keyed by player id (DB uuid) */
  scoreSnapshots: Map<string, SnapshotForScoring>;
  /** what each player cost when added to the squad (typically round-1 prices) */
  purchasePrices: Map<string, number>;
  budgetSek: number;
  captainMultiplier: number;
  captainBonusOnlyPositive: boolean;
  bankInterestPctPerRound: number; // 0.01 = 1%
  /** sum of transfer fees paid in this round; 0 in v1 */
  transferFeesPaidSek: number;
};

export type PlayerScoreLine = {
  playerId: string;
  growthSek: number;
  snapshotId: string;
  isCaptain: boolean;
};

export type ScoreResult = {
  sumGrowthSek: number;
  captainBonusSek: number;
  bankInterestSek: number;
  transferFeesSek: number;
  totalPointsSek: number;
  snapshotIdsUsed: string[];
  perPlayer: PlayerScoreLine[];
  /** Players in the squad missing a snapshot — flagged for the operator. */
  missingSnapshots: string[];
};

export function scoreSquadForRound(args: ScoringInputs): ScoreResult {
  const {
    squad,
    scoreSnapshots,
    purchasePrices,
    budgetSek,
    captainMultiplier,
    captainBonusOnlyPositive,
    bankInterestPctPerRound,
    transferFeesPaidSek,
  } = args;

  let sumGrowth = 0;
  const perPlayer: PlayerScoreLine[] = [];
  const missing: string[] = [];

  for (const p of squad.players) {
    const snap = scoreSnapshots.get(p.id);
    if (!snap) {
      missing.push(p.id);
      continue;
    }
    sumGrowth += snap.growthSek;
    perPlayer.push({
      playerId: p.id,
      growthSek: snap.growthSek,
      snapshotId: snap.snapshotId,
      isCaptain: squad.captainPlayerId === p.id,
    });
  }

  let captainBonus = 0;
  if (squad.captainPlayerId) {
    const cap = scoreSnapshots.get(squad.captainPlayerId);
    if (cap) {
      const raw = cap.growthSek * (captainMultiplier - 1);
      captainBonus = captainBonusOnlyPositive ? Math.max(0, raw) : raw;
    }
  }

  const totalSpent = squad.players.reduce(
    (acc, p) => acc + (purchasePrices.get(p.id) ?? 0),
    0,
  );
  const leftover = Math.max(0, budgetSek - totalSpent);
  const bankInterest = Math.floor(leftover * bankInterestPctPerRound);

  const total =
    sumGrowth + captainBonus + bankInterest - transferFeesPaidSek;

  return {
    sumGrowthSek: sumGrowth,
    captainBonusSek: captainBonus,
    bankInterestSek: bankInterest,
    transferFeesSek: transferFeesPaidSek,
    totalPointsSek: total,
    snapshotIdsUsed: perPlayer.map((p) => p.snapshotId),
    perPlayer,
    missingSnapshots: missing,
  };
}
