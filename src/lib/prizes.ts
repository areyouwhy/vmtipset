/**
 * Prize-pool math. All values are in basis points (1 bp = 0.01%, 10000 bp =
 * 100%) and SEK whole-kronor — no fractions. Floor-division everywhere keeps
 * the math reproducible; any leftover rounding is captured in `remainderSek`
 * so the operator can see it instead of silently absorbing it.
 */

import type { PrizePoolKey } from "@/db/schema";

export const BPS_DENOMINATOR = 10000;

export type PrizePlaceInput = {
  place: number;
  shareBps: number;
};

export type PrizePoolInput = {
  key: PrizePoolKey;
  label: string;
  allocationBps: number;
  places: PrizePlaceInput[];
};

export type PrizePlacePayout = {
  place: number;
  shareBps: number;
  amountSek: number;
};

export type PrizePoolPayout = {
  key: PrizePoolKey;
  label: string;
  allocationBps: number;
  poolAmountSek: number;
  places: PrizePlacePayout[];
  /** Rounding leftover inside this pool (totalAmount − sum of place amounts). */
  remainderSek: number;
};

export type PotPayout = {
  approvedCount: number;
  stakeSek: number;
  totalPotSek: number;
  pools: PrizePoolPayout[];
  /** Rounding leftover at the pot level (totalPot − sum of pool amounts). */
  remainderSek: number;
};

/** Compute the full prize-out structure for a given approved-count + config. */
export function calculatePotPayout(args: {
  approvedCount: number;
  stakeSek: number;
  pools: PrizePoolInput[];
}): PotPayout {
  const { approvedCount, stakeSek, pools } = args;
  const totalPotSek = approvedCount * stakeSek;

  let allocatedToPoolsSek = 0;

  const computedPools: PrizePoolPayout[] = pools.map((pool) => {
    const poolAmountSek = Math.floor(
      (totalPotSek * pool.allocationBps) / BPS_DENOMINATOR,
    );
    allocatedToPoolsSek += poolAmountSek;

    let allocatedToPlacesSek = 0;
    const places: PrizePlacePayout[] = pool.places.map((place) => {
      const amountSek = Math.floor(
        (poolAmountSek * place.shareBps) / BPS_DENOMINATOR,
      );
      allocatedToPlacesSek += amountSek;
      return {
        place: place.place,
        shareBps: place.shareBps,
        amountSek,
      };
    });

    return {
      key: pool.key,
      label: pool.label,
      allocationBps: pool.allocationBps,
      poolAmountSek,
      places,
      remainderSek: poolAmountSek - allocatedToPlacesSek,
    };
  });

  return {
    approvedCount,
    stakeSek,
    totalPotSek,
    pools: computedPools,
    remainderSek: totalPotSek - allocatedToPoolsSek,
  };
}

// ─── Validation ─────────────────────────────────────────────────────────────

export type ValidationError = string;

export function validatePoolAllocations(
  pools: { allocationBps: number }[],
): ValidationError[] {
  const errors: ValidationError[] = [];
  if (pools.length === 0) {
    errors.push("Minst en pott krävs.");
    return errors;
  }
  for (const p of pools) {
    if (p.allocationBps < 0) {
      errors.push("Allokering kan inte vara negativ.");
      return errors;
    }
  }
  const sum = pools.reduce((acc, p) => acc + p.allocationBps, 0);
  if (sum !== BPS_DENOMINATOR) {
    errors.push(
      `Pottfördelningen summerar till ${bpsToPercent(sum)} — måste vara exakt 100%.`,
    );
  }
  return errors;
}

export function validatePlaceShares(
  places: PrizePlaceInput[],
): ValidationError[] {
  const errors: ValidationError[] = [];
  if (places.length === 0) {
    errors.push("Minst en plats krävs.");
    return errors;
  }
  for (const p of places) {
    if (p.shareBps < 0) {
      errors.push("Andel kan inte vara negativ.");
      return errors;
    }
  }
  const sum = places.reduce((acc, p) => acc + p.shareBps, 0);
  if (sum !== BPS_DENOMINATOR) {
    errors.push(
      `Platsfördelningen summerar till ${bpsToPercent(sum)} — måste vara exakt 100%.`,
    );
  }
  // Places must be 1, 2, 3, ... with no gaps and no duplicates.
  const sorted = [...places].sort((a, b) => a.place - b.place);
  for (let i = 0; i < sorted.length; i++) {
    const expected = i + 1;
    if (sorted[i].place !== expected) {
      errors.push(
        `Platser måste vara 1, 2, 3, ... utan luckor (förväntade ${expected}, fick ${sorted[i].place}).`,
      );
      break;
    }
  }
  return errors;
}

// ─── Display helpers ────────────────────────────────────────────────────────

export function bpsToPercent(bps: number): string {
  const v = bps / 100;
  return Number.isInteger(v) ? `${v}%` : `${v.toFixed(2)}%`;
}

export function pctToBps(pct: number): number {
  return Math.round(pct * 100);
}

export function formatSek(amount: number): string {
  return amount.toLocaleString("sv-SE");
}
