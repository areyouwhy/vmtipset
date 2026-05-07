import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  prizePlaces,
  prizePools,
  users,
  type PrizePoolKey,
} from "@/db/schema";
import {
  calculatePotPayout,
  validatePlaceShares,
  validatePoolAllocations,
  type PotPayout,
  type PrizePoolInput,
} from "./prizes";
import { currentRules } from "./rules";

/**
 * Default config seeded the first time an admin loads the config page. Once
 * rows exist in the DB they are the source of truth — these defaults are
 * only consulted at first run.
 */
export const DEFAULT_POOLS: PrizePoolInput[] = [
  {
    key: "main_league",
    label: "MAIN LEAGUE",
    allocationBps: 8000,
    places: [
      { place: 1, shareBps: 5000 },
      { place: 2, shareBps: 3000 },
      { place: 3, shareBps: 2000 },
    ],
  },
  {
    key: "daily_bets",
    label: "DAILY BETS",
    allocationBps: 2000,
    places: [
      { place: 1, shareBps: 6000 },
      { place: 2, shareBps: 4000 },
    ],
  },
];

export async function ensureDefaultPrizes(): Promise<void> {
  const existing = await db.select().from(prizePools).limit(1);
  if (existing.length > 0) return;

  for (const p of DEFAULT_POOLS) {
    const [inserted] = await db
      .insert(prizePools)
      .values({
        key: p.key,
        label: p.label,
        allocationBps: p.allocationBps,
      })
      .returning();
    if (p.places.length > 0) {
      await db.insert(prizePlaces).values(
        p.places.map((place) => ({
          poolId: inserted.id,
          place: place.place,
          shareBps: place.shareBps,
        })),
      );
    }
  }
}

export async function loadPrizePools(): Promise<PrizePoolInput[]> {
  const pools = await db.select().from(prizePools);
  const places = await db.select().from(prizePlaces);

  // Stable order: main_league first, then daily_bets, then any future keys.
  const order: Record<PrizePoolKey, number> = {
    main_league: 0,
    daily_bets: 1,
  };

  return pools
    .filter((p) => p.active)
    .sort((a, b) => order[a.key] - order[b.key])
    .map((pool) => ({
      key: pool.key,
      label: pool.label,
      allocationBps: pool.allocationBps,
      places: places
        .filter((pl) => pl.poolId === pool.id)
        .sort((a, b) => a.place - b.place)
        .map((pl) => ({ place: pl.place, shareBps: pl.shareBps })),
    }));
}

export async function getApprovedCount(): Promise<number> {
  const [r] = await db
    .select({ n: count() })
    .from(users)
    .where(eq(users.status, "approved"));
  return r.n;
}

export async function getPotPayout(): Promise<PotPayout> {
  const [pools, approvedCount] = await Promise.all([
    loadPrizePools(),
    getApprovedCount(),
  ]);
  return calculatePotPayout({
    approvedCount,
    stakeSek: currentRules.stakePerUserSek,
    pools,
  });
}

export type SaveResult = { ok: boolean; errors: string[] };

export async function savePoolAllocations(
  input: { key: PrizePoolKey; allocationBps: number }[],
): Promise<SaveResult> {
  const errors = validatePoolAllocations(input);
  if (errors.length > 0) return { ok: false, errors };

  for (const pool of input) {
    await db
      .update(prizePools)
      .set({ allocationBps: pool.allocationBps, updatedAt: new Date() })
      .where(eq(prizePools.key, pool.key));
  }
  return { ok: true, errors: [] };
}

export async function savePoolPlaces(
  poolKey: PrizePoolKey,
  places: { place: number; shareBps: number }[],
): Promise<SaveResult> {
  const errors = validatePlaceShares(places);
  if (errors.length > 0) return { ok: false, errors };

  const [pool] = await db
    .select()
    .from(prizePools)
    .where(eq(prizePools.key, poolKey))
    .limit(1);
  if (!pool) return { ok: false, errors: ["Pott hittades inte."] };

  await db.delete(prizePlaces).where(eq(prizePlaces.poolId, pool.id));
  if (places.length > 0) {
    await db.insert(prizePlaces).values(
      places.map((p) => ({
        poolId: pool.id,
        place: p.place,
        shareBps: p.shareBps,
      })),
    );
  }
  return { ok: true, errors: [] };
}
