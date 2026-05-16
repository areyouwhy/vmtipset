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
  priceSek: number;
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

export function validateSquad(c: SquadCandidate): SquadValidationError[] {
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

  // 5. Budget
  const totalPrice = c.players.reduce((acc, p) => acc + p.priceSek, 0);
  if (totalPrice > r.budgetSek) {
    errors.push(
      `Över budget: ${totalPrice.toLocaleString("sv-SE")} > ${r.budgetSek.toLocaleString("sv-SE")} SEK.`,
    );
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
