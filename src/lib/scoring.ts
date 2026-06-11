import type { Position } from "@/db/schema";

/**
 * Pure scoring engine.
 *
 * Inputs in, deltas out. No DB calls. Hand-rolled test coverage; re-running
 * with the same inputs is always identical.
 *
 * Model (matches `/hur` and `RULES.md`):
 *
 *   TEAM VALUE  =  SQUAD VALUE  +  BANK
 *
 * Two parallel channels move team value each round:
 *
 *   1) SQUAD VALUE drifts with Aftonbladet's price updates. Per-player
 *      `growth` IS the price delta — sum of growth across the squad equals
 *      Δ squad value.
 *
 *   2) BANK is our path-dependent cash ledger:
 *          bank_locked_N = bank_end_{N-1} + Σ (sell − buy − fee for round-N transfers)
 *          interest_N    = floor(bank_locked_N × interest_pct)
 *          bank_end_N    = bank_locked_N + interest_N + captain_bonus_N
 *      Interest is only on cash. Captain bonus is credited to bank because it
 *      doesn't affect the player's actual price. Transfer fees + cash flow
 *      land in bank at lock time, before interest is computed.
 *
 *   round_score_N  ≡  Δ TEAM VALUE this round
 *                  =  sumGrowth     (squad drift)
 *                  +  captainBonus + interest + cashFlow − fees    (bank drift)
 *
 * Round 1 special case: there's no bank_end_0; the runner passes
 * bankEnteringSek = budgetSek − sum(initial squad purchase prices), with
 * cashFlow = 0 and fees = 0 (no transfers happen on the initial pick).
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
  /** Snapshot for THIS round, keyed by player id. */
  scoreSnapshots: Map<string, SnapshotForScoring>;
  /** Bank cash AFTER this round's transfer window closed, before matches
   *  start. Interest is computed against this. */
  bankEnteringSek: number;
  /** Σ (sell − buy) for this round's transfers. Excludes fees. Already baked
   *  into bankEnteringSek; passed in only so we can store it for the audit. */
  transferCashFlowSek: number;
  /** Σ transfer fees this round. Also already baked into bankEnteringSek. */
  transferFeesPaidSek: number;
  captainMultiplier: number;
  captainBonusOnlyPositive: boolean;
  bankInterestPctPerRound: number; // 0.01 = 1%
};

export type PlayerScoreLine = {
  playerId: string;
  growthSek: number;
  snapshotId: string;
  isCaptain: boolean;
};

export type ScoreResult = {
  /** Sum of player growth = Δ squad value from price drift this round. */
  sumGrowthSek: number;
  captainBonusSek: number;
  bankInterestSek: number;
  transferFeesSek: number;
  transferCashFlowSek: number;
  /** Bank cash at end of round (after interest + captain credit). */
  bankSekEnd: number;
  /** Δ team value this round = sumGrowth + captain + interest + cashFlow − fees. */
  totalPointsSek: number;
  snapshotIdsUsed: string[];
  perPlayer: PlayerScoreLine[];
  /** Players in the squad missing a snapshot — flagged for the operator. */
  missingSnapshots: string[];
};

/**
 * What a squad actually *cost* when it was locked — the basis for the bank
 * (leftover cash) balance. A round snapshot's `priceSek` drifts upward as the
 * player gains value during the round, so the original purchase price is
 * `priceSek − growthSek`. Bank must be derived from this, never from the
 * current price: using the current price subtracts in-round growth from the
 * bank, which cancels the squad-value gain and makes a rising player look like
 * a falling bank.
 */
export function squadPurchaseCostSek(
  snaps: Array<{ priceSek: number; growthSek: number }>,
): number {
  return snaps.reduce((acc, s) => acc + (s.priceSek - s.growthSek), 0);
}

export function scoreSquadForRound(args: ScoringInputs): ScoreResult {
  const {
    squad,
    scoreSnapshots,
    bankEnteringSek,
    transferCashFlowSek,
    transferFeesPaidSek,
    captainMultiplier,
    captainBonusOnlyPositive,
    bankInterestPctPerRound,
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

  // Interest is only on cash. Floor at 0 if somehow negative.
  const interestBase = Math.max(0, bankEnteringSek);
  const bankInterest = Math.floor(interestBase * bankInterestPctPerRound);

  // Bank end = cash entering + interest credit + captain credit. Growth
  // and transfer effects are NOT bank-side: growth moves the squad value,
  // transfer fees + cashFlow were already taken at lock time (hence
  // already in bankEnteringSek).
  const bankSekEnd = bankEnteringSek + bankInterest + captainBonus;

  // Δ team value this round = squad drift + bank drift.
  //   squad drift  = sumGrowth
  //   bank drift   = interest + captain + cashFlow − fees
  // cashFlow and fees show up in bankEnteringSek as transfer-time changes;
  // they ARE part of this round's Δ bank, so we restate them here for the
  // round-score breakdown.
  const totalPointsSek =
    sumGrowth + captainBonus + bankInterest + transferCashFlowSek - transferFeesPaidSek;

  return {
    sumGrowthSek: sumGrowth,
    captainBonusSek: captainBonus,
    bankInterestSek: bankInterest,
    transferFeesSek: transferFeesPaidSek,
    transferCashFlowSek,
    bankSekEnd,
    totalPointsSek,
    snapshotIdsUsed: perPlayer.map((p) => p.snapshotId),
    perPlayer,
    missingSnapshots: missing,
  };
}
