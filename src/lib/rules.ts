/**
 * Live rule set for Copa del Mundo 2026.
 *
 * Source of truth for both /how and the scoring engine. Any change here
 * must be reflected in RULES.md (with date + reason) and ideally backed
 * by tests.
 */

export type Position = "GK" | "DEF" | "MID" | "FWD";

export type Formation = {
  def: number;
  mid: number;
  fwd: number;
  // GK is always 1, so it's implied.
};

export type PositionConstraint = { min: number; max: number };

export type RuleSet = {
  /** Players in a squad (only starting XI — no bench). */
  squadSize: number;

  /** Currency budget in SEK (Aftonbladet uses 50M for league play). */
  budgetSek: number;

  /** Min/max players per position within a squad. */
  positions: Record<Position, PositionConstraint>;

  /** Legal starting formations (GK is always 1). */
  legalFormations: Formation[];

  /** Captain multiplier applied to captain's growth on top of base. */
  captainMultiplier: number;

  /** If true, captain bonus is only awarded on positive growth (no doubling losses). */
  captainBonusOnlyPositive: boolean;

  /** Interest paid on unspent budget per round, as a fraction (0.01 = 1%). */
  bankInterestPctPerRound: number;

  /** Transfer fee as fraction of out-going player's price (0.01 = 1%). */
  transferFeePct: number;

  /** Free transfers per round before fees apply. */
  freeTransfersPerRound: number;

  /** Max players from the same club (PL-style limit). */
  maxFromSameClub: number;

  /** Max players from the same country (WC-specific limit; null = no limit). */
  maxFromSameCountry: number | null;

  /** Stake per approved user, in SEK. */
  stakePerUserSek: number;

  /** Calendar metadata. */
  meta: {
    lastVerifiedAt: string | null; // ISO date when these values were checked against Aftonbladet's published ruleset
    sourceRulesetId: string | null; // e.g. "193" (PL spring 2026) until WC 2026 is published
  };
};

/**
 * Verified against Aftonbladet's WC 2026 Manager ruleset
 * (id 197 — `SoccerCupSimple Nations 2023`) on 2026-05-14.
 *
 * Position counts derived from the 7 published formations:
 *   GK 1, DEF 3–5, MID 3–5, FWD 1–3.
 *
 * Club/country caps and the financial side (stake, transfer fee, bank
 * interest, captain bonus rule) aren't in the ruleset JSON — they're
 * league-level decisions we own. Captured here as the values our
 * scoring engine actually uses; see RULES.md for the deviation log.
 */
export const currentRules: RuleSet = {
  squadSize: 11,
  budgetSek: 50_000_000,
  positions: {
    GK: { min: 1, max: 1 },
    DEF: { min: 3, max: 5 },
    MID: { min: 3, max: 5 },
    FWD: { min: 1, max: 3 },
  },
  legalFormations: [
    { def: 3, mid: 4, fwd: 3 },
    { def: 3, mid: 5, fwd: 2 },
    { def: 4, mid: 3, fwd: 3 },
    { def: 4, mid: 4, fwd: 2 },
    { def: 4, mid: 5, fwd: 1 },
    { def: 5, mid: 3, fwd: 2 },
    { def: 5, mid: 4, fwd: 1 },
  ],
  captainMultiplier: 2,
  captainBonusOnlyPositive: true,
  bankInterestPctPerRound: 0.01,
  transferFeePct: 0.01,
  freeTransfersPerRound: 0,
  // In the WC fantasy data model each "club" is a national team, so the
  // per-club cap is effectively a per-country cap of 3.
  maxFromSameClub: 3,
  maxFromSameCountry: null,
  stakePerUserSek: 300,
  meta: {
    lastVerifiedAt: "2026-05-14",
    sourceRulesetId: "197", // WC 2026 — verified against Aftonbladet
  },
};

/** Sum of position minimums must not exceed squad size. */
export function minPositionTotal(rules: RuleSet): number {
  return (
    rules.positions.GK.min +
    rules.positions.DEF.min +
    rules.positions.MID.min +
    rules.positions.FWD.min
  );
}

/** Sum of position maximums must be at least squad size. */
export function maxPositionTotal(rules: RuleSet): number {
  return (
    rules.positions.GK.max +
    rules.positions.DEF.max +
    rules.positions.MID.max +
    rules.positions.FWD.max
  );
}

export function isFormationLegal(
  formation: Formation,
  rules: RuleSet,
): boolean {
  return rules.legalFormations.some(
    (f) =>
      f.def === formation.def &&
      f.mid === formation.mid &&
      f.fwd === formation.fwd,
  );
}

export function formationToString(formation: Formation): string {
  return `${formation.def}-${formation.mid}-${formation.fwd}`;
}
