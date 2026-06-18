import type { Position } from "@/db/schema";
import {
  currentRules,
  formationToString,
  isFormationLegal,
} from "./rules";

/**
 * A candidate squad — what a user is trying to save. The validator answers
 * "is this legal under the current ruleset?" without touching the DB.
 */
export type SquadCandidatePlayer = {
  id: string;
  position: Position;
  clubExternalId: string | null;
  countryCode: string | null;
  /** Current market price this round. */
  priceSek: number;
  /** This-round growth. Needed only for the round-1 build budget, where cost is
   *  the purchase price = priceSek − growthSek (price drift mustn't eat budget).
   *  Defaults to 0 when omitted (= no growth → cost is just priceSek). */
  growthSek?: number;
};

export type SquadCandidate = {
  players: SquadCandidatePlayer[];
  captainPlayerId: string | null;
};

export type SquadValidationError = string;

export type SquadSummary = {
  count: number;
  byPosition: Record<Position, number>;
  byClub: Record<string, number>;
  byCountry: Record<string, number>;
  totalPriceSek: number;
  remainingBudgetSek: number;
};

export function summarize(c: SquadCandidate): SquadSummary {
  const byPosition: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  const byClub: Record<string, number> = {};
  const byCountry: Record<string, number> = {};
  let total = 0;
  for (const p of c.players) {
    byPosition[p.position]++;
    if (p.clubExternalId) {
      byClub[p.clubExternalId] = (byClub[p.clubExternalId] ?? 0) + 1;
    }
    if (p.countryCode) {
      byCountry[p.countryCode] = (byCountry[p.countryCode] ?? 0) + 1;
    }
    total += p.priceSek;
  }
  return {
    count: c.players.length,
    byPosition,
    byClub,
    byCountry,
    totalPriceSek: total,
    remainingBudgetSek: currentRules.budgetSek - total,
  };
}

/**
 * Budget context. Two modes:
 *
 *  - "build" (round 1, no prior squad): you have the 50M budget and pay each
 *    player's PURCHASE price (priceSek − growthSek). In-round price drift must
 *    not eat into the budget — a squad that gained value isn't "over budget".
 *
 *  - "transfer" (round ≥2): spending power = bank entering the round + the
 *    market value of the squad you're transferring FROM. You sell/buy at market
 *    price, fees come out of the bank. KVAR = the bank left after the swaps.
 *
 *  TEAM VALUE = SQUAD VALUE + BANK; this models the BANK side of a save.
 */
export type SquadBudgetContext = {
  mode: "build" | "transfer";
  /** 50M for build; bank_end of the previous round for transfer. */
  bankEnteringSek: number;
  /** Market value of the squad being transferred from (0 for build). */
  referenceValueSek: number;
  /** Σ transfer fees for this submission (0 for build). */
  transferFeesSek: number;
};

export type SquadBudget = {
  /** Total you can spend on the squad: 50M (build) or bank + reference value. */
  spendingPowerSek: number;
  /** What the chosen squad costs: Σ purchase price (build) or Σ market (transfer). */
  squadCostSek: number;
  feesSek: number;
  /** spendingPower − squadCost − fees. This is KVAR (the bank after the save). */
  remainingSek: number;
  overBudget: boolean;
};

export function computeSquadBudget(
  players: Pick<SquadCandidatePlayer, "priceSek" | "growthSek">[],
  ctx: SquadBudgetContext,
): SquadBudget {
  const spendingPowerSek =
    ctx.mode === "build"
      ? currentRules.budgetSek
      : ctx.bankEnteringSek + ctx.referenceValueSek;
  const squadCostSek = players.reduce(
    (acc, p) =>
      acc +
      (ctx.mode === "build" ? p.priceSek - (p.growthSek ?? 0) : p.priceSek),
    0,
  );
  const remainingSek = spendingPowerSek - squadCostSek - ctx.transferFeesSek;
  return {
    spendingPowerSek,
    squadCostSek,
    feesSek: ctx.transferFeesSek,
    remainingSek,
    overBudget: remainingSek < 0,
  };
}

export function validateSquad(
  c: SquadCandidate,
  budgetCtx?: SquadBudgetContext,
): SquadValidationError[] {
  const errors: SquadValidationError[] = [];
  const r = currentRules;

  // 1. Squad size
  if (c.players.length !== r.squadSize) {
    errors.push(
      `Truppen måste ha exakt ${r.squadSize} spelare (har ${c.players.length}).`,
    );
  }

  // 2. No duplicates
  const seen = new Set<string>();
  for (const p of c.players) {
    if (seen.has(p.id)) {
      errors.push("Samma spelare vald fler än en gång.");
      break;
    }
    seen.add(p.id);
  }

  // 3. Position counts within min/max
  const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of c.players) counts[p.position]++;
  for (const pos of ["GK", "DEF", "MID", "FWD"] as const) {
    const range = r.positions[pos];
    if (counts[pos] < range.min) {
      errors.push(
        `För få ${pos}: ${counts[pos]} (minst ${range.min} krävs).`,
      );
    } else if (counts[pos] > range.max) {
      errors.push(
        `För många ${pos}: ${counts[pos]} (max ${range.max}).`,
      );
    }
  }

  // 4. Formation legality (only meaningful when squad is full and GKs are correct)
  if (c.players.length === r.squadSize && counts.GK === 1) {
    const formation = { def: counts.DEF, mid: counts.MID, fwd: counts.FWD };
    if (!isFormationLegal(formation, r)) {
      errors.push(
        `Olaglig formation: ${formationToString(formation)}.`,
      );
    }
  }

  // 5. Budget. With a context, use the team-value/bank model (build vs
  // transfer); without one, fall back to the flat 50M-at-current-price check
  // (round-1 build at pick time, where growth is 0 so the two agree).
  if (budgetCtx) {
    const b = computeSquadBudget(c.players, budgetCtx);
    if (b.overBudget) {
      errors.push(
        `Över budget: kostar ${b.squadCostSek.toLocaleString("sv-SE")}${
          b.feesSek ? ` + avgift ${b.feesSek.toLocaleString("sv-SE")}` : ""
        } > ${b.spendingPowerSek.toLocaleString("sv-SE")} SEK.`,
      );
    }
  } else {
    const totalPrice = c.players.reduce((acc, p) => acc + p.priceSek, 0);
    if (totalPrice > r.budgetSek) {
      errors.push(
        `Över budget: ${totalPrice.toLocaleString("sv-SE")} > ${r.budgetSek.toLocaleString("sv-SE")} SEK.`,
      );
    }
  }

  // 6. Same-club limit
  const byClub = new Map<string, number>();
  for (const p of c.players) {
    if (!p.clubExternalId) continue;
    byClub.set(p.clubExternalId, (byClub.get(p.clubExternalId) ?? 0) + 1);
  }
  for (const [clubId, n] of byClub) {
    if (n > r.maxFromSameClub) {
      errors.push(
        `Max ${r.maxFromSameClub} spelare per landslag (har ${n} från ${clubId}).`,
      );
    }
  }

  // 7. Same-country limit (if set)
  if (r.maxFromSameCountry !== null) {
    const byCountry = new Map<string, number>();
    for (const p of c.players) {
      if (!p.countryCode) continue;
      byCountry.set(p.countryCode, (byCountry.get(p.countryCode) ?? 0) + 1);
    }
    for (const [country, n] of byCountry) {
      if (n > r.maxFromSameCountry) {
        errors.push(
          `Max ${r.maxFromSameCountry} spelare per land (har ${n} från ${country}).`,
        );
      }
    }
  }

  // 8. Captain
  if (!c.captainPlayerId) {
    errors.push("Ingen kapten vald.");
  } else if (!c.players.find((p) => p.id === c.captainPlayerId)) {
    errors.push("Kaptenen måste vara med i truppen.");
  }

  return errors;
}

export function isValidSquad(c: SquadCandidate): boolean {
  return validateSquad(c).length === 0;
}

/**
 * Auto-pick: random-shuffled within each position, then walk in shuffled
 * order picking the first player whose addition still leaves enough budget
 * for the cheapest legal completion of the squad. Result varies between
 * calls so the user can hit AUTO-VÄLJ multiple times to explore options.
 *
 * - Stays within the 50M budget.
 * - Respects per-club and per-country caps.
 * - Captain = a random FWD in the picked squad (falls back to most-
 *   expensive player overall).
 *
 * Pure: does not touch state.
 */
export type AutoPickResult = {
  ok: boolean;
  playerIds: string[];
  captainPlayerId: string | null;
  totalPriceSek: number;
  reason?: string;
};

export type AutoPickPlayer = SquadCandidatePlayer;

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function autoPickSquad(
  pool: AutoPickPlayer[],
  formation: { def: number; mid: number; fwd: number },
): AutoPickResult {
  // Randomised picking can occasionally exhaust the budget on the last few
  // slots when a tight pool gets shuffled into an unlucky order. Retry a
  // handful of times with fresh shuffles before surrendering.
  let last: AutoPickResult = {
    ok: false,
    playerIds: [],
    captainPlayerId: null,
    totalPriceSek: 0,
    reason: "no attempt",
  };
  for (let attempt = 0; attempt < 20; attempt++) {
    last = autoPickSquadOnce(pool, formation);
    if (last.ok) return last;
  }
  return last;
}

function autoPickSquadOnce(
  pool: AutoPickPlayer[],
  formation: { def: number; mid: number; fwd: number },
): AutoPickResult {
  const r = currentRules;
  const remaining: Record<Position, number> = {
    GK: 1,
    DEF: formation.def,
    MID: formation.mid,
    FWD: formation.fwd,
  };

  // Cheap-first per position — used to estimate the minimum cost of the
  // unfilled remainder so we don't blow the budget early.
  const cheapByPos: Record<Position, AutoPickPlayer[]> = {
    GK: pool
      .filter((p) => p.position === "GK")
      .sort((a, b) => a.priceSek - b.priceSek),
    DEF: pool
      .filter((p) => p.position === "DEF")
      .sort((a, b) => a.priceSek - b.priceSek),
    MID: pool
      .filter((p) => p.position === "MID")
      .sort((a, b) => a.priceSek - b.priceSek),
    FWD: pool
      .filter((p) => p.position === "FWD")
      .sort((a, b) => a.priceSek - b.priceSek),
  };
  // Shuffled per position — picking order is randomised each call.
  const shuffledByPos: Record<Position, AutoPickPlayer[]> = {
    GK: shuffle(cheapByPos.GK),
    DEF: shuffle(cheapByPos.DEF),
    MID: shuffle(cheapByPos.MID),
    FWD: shuffle(cheapByPos.FWD),
  };

  const picked: AutoPickPlayer[] = [];
  const usedIds = new Set<string>();
  const clubCount = new Map<string, number>();
  const countryCount = new Map<string, number>();
  let totalCost = 0;

  function minCostOfUnfilled(): number {
    let sum = 0;
    for (const pos of ["GK", "DEF", "MID", "FWD"] as const) {
      const n = remaining[pos];
      if (n <= 0) continue;
      const avail = cheapByPos[pos].filter((p) => !usedIds.has(p.id)).slice(0, n);
      sum += avail.reduce((a, p) => a + p.priceSek, 0);
    }
    return sum;
  }

  function isAllowedByLimits(p: AutoPickPlayer): boolean {
    if (p.clubExternalId) {
      const c = clubCount.get(p.clubExternalId) ?? 0;
      if (c >= r.maxFromSameClub) return false;
    }
    if (r.maxFromSameCountry !== null && p.countryCode) {
      const c = countryCount.get(p.countryCode) ?? 0;
      if (c >= r.maxFromSameCountry) return false;
    }
    return true;
  }

  for (const pos of ["GK", "DEF", "MID", "FWD"] as const) {
    while (remaining[pos] > 0) {
      // Reserve cost of every other still-empty slot so we don't overspend.
      remaining[pos]--;
      const reserved = minCostOfUnfilled();
      remaining[pos]++;
      const maxThisPick = r.budgetSek - totalCost - reserved;

      // First pass: walk shuffled candidates and take the first that fits all
      // constraints + this affordability cap.
      let chosen: AutoPickPlayer | null = null;
      for (const p of shuffledByPos[pos]) {
        if (usedIds.has(p.id)) continue;
        if (p.priceSek > maxThisPick) continue;
        if (!isAllowedByLimits(p)) continue;
        chosen = p;
        break;
      }
      // Fallback: if nobody matched (e.g. shuffled order made every option
      // exceed maxThisPick), take the cheapest remaining at this position
      // that satisfies club/country/dup rules.
      if (!chosen) {
        for (const p of cheapByPos[pos]) {
          if (usedIds.has(p.id)) continue;
          if (!isAllowedByLimits(p)) continue;
          if (totalCost + p.priceSek > r.budgetSek) continue;
          chosen = p;
          break;
        }
      }
      if (!chosen) {
        return {
          ok: false,
          playerIds: picked.map((p) => p.id),
          captainPlayerId: null,
          totalPriceSek: totalCost,
          reason: `Kunde inte fylla ${pos} (budget eller klubb/land-tak slut).`,
        };
      }

      picked.push(chosen);
      usedIds.add(chosen.id);
      remaining[pos]--;
      totalCost += chosen.priceSek;
      if (chosen.clubExternalId) {
        clubCount.set(
          chosen.clubExternalId,
          (clubCount.get(chosen.clubExternalId) ?? 0) + 1,
        );
      }
      if (chosen.countryCode) {
        countryCount.set(
          chosen.countryCode,
          (countryCount.get(chosen.countryCode) ?? 0) + 1,
        );
      }
    }
  }

  // Captain: random FWD in the picked squad (so it varies). Falls back to
  // the most expensive picked player if no FWD got selected.
  const fwds = picked.filter((p) => p.position === "FWD");
  const captain =
    fwds.length > 0
      ? fwds[Math.floor(Math.random() * fwds.length)].id
      : ([...picked].sort((a, b) => b.priceSek - a.priceSek)[0]?.id ?? null);

  return {
    ok: true,
    playerIds: picked.map((p) => p.id),
    captainPlayerId: captain,
    totalPriceSek: totalCost,
  };
}
