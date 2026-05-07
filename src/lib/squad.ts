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
        `Max ${r.maxFromSameClub} spelare per klubb (har ${n} från ${clubId}).`,
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
 * Greedy auto-pick: cheapest legal squad for a given formation, respecting
 * club + country limits and the budget cap. Captain = highest-priced FWD in
 * the picked squad (or highest-priced overall if no FWD picked, which would
 * already mean the squad is illegal anyway).
 *
 * Pure: does not touch state. Returns the player ids and captain id.
 */
export type AutoPickResult = {
  ok: boolean;
  playerIds: string[];
  captainPlayerId: string | null;
  totalPriceSek: number;
  reason?: string;
};

export type AutoPickPlayer = SquadCandidatePlayer;

export function autoPickSquad(
  pool: AutoPickPlayer[],
  formation: { def: number; mid: number; fwd: number },
): AutoPickResult {
  const r = currentRules;
  const slotsByPos: Record<Position, number> = {
    GK: 1,
    DEF: formation.def,
    MID: formation.mid,
    FWD: formation.fwd,
  };

  // Sort within each position by price ascending — cheapest first.
  const byPos: Record<Position, AutoPickPlayer[]> = {
    GK: pool.filter((p) => p.position === "GK").sort((a, b) => a.priceSek - b.priceSek),
    DEF: pool.filter((p) => p.position === "DEF").sort((a, b) => a.priceSek - b.priceSek),
    MID: pool.filter((p) => p.position === "MID").sort((a, b) => a.priceSek - b.priceSek),
    FWD: pool.filter((p) => p.position === "FWD").sort((a, b) => a.priceSek - b.priceSek),
  };

  const picked: AutoPickPlayer[] = [];
  const clubCount = new Map<string, number>();
  const countryCount = new Map<string, number>();
  let totalCost = 0;

  for (const pos of ["GK", "DEF", "MID", "FWD"] as const) {
    const need = slotsByPos[pos];
    let placed = 0;
    for (const p of byPos[pos]) {
      if (placed >= need) break;
      if (p.clubExternalId) {
        const c = clubCount.get(p.clubExternalId) ?? 0;
        if (c >= r.maxFromSameClub) continue;
      }
      if (r.maxFromSameCountry !== null && p.countryCode) {
        const c = countryCount.get(p.countryCode) ?? 0;
        if (c >= r.maxFromSameCountry) continue;
      }
      if (totalCost + p.priceSek > r.budgetSek) continue;
      picked.push(p);
      placed++;
      totalCost += p.priceSek;
      if (p.clubExternalId) {
        clubCount.set(p.clubExternalId, (clubCount.get(p.clubExternalId) ?? 0) + 1);
      }
      if (p.countryCode) {
        countryCount.set(p.countryCode, (countryCount.get(p.countryCode) ?? 0) + 1);
      }
    }
    if (placed < need) {
      return {
        ok: false,
        playerIds: picked.map((p) => p.id),
        captainPlayerId: null,
        totalPriceSek: totalCost,
        reason: `Kunde inte fylla ${pos}: ${placed}/${need} (budget eller klubb/land-tak slut).`,
      };
    }
  }

  // Captain: priciest FWD if any, else priciest overall.
  const sorted = [...picked].sort((a, b) => b.priceSek - a.priceSek);
  const captain =
    sorted.find((p) => p.position === "FWD")?.id ?? sorted[0]?.id ?? null;

  return {
    ok: true,
    playerIds: picked.map((p) => p.id),
    captainPlayerId: captain,
    totalPriceSek: totalCost,
  };
}
