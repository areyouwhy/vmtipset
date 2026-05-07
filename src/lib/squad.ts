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
