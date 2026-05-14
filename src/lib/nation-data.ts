import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  clubs,
  playerRoundSnapshots,
  players,
  rounds,
  type Player,
} from "@/db/schema";

export type NationPlayer = {
  id: string;
  name: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  /** Most recent snapshot price; falls back to baseline; null if none. */
  priceSek: number | null;
  basePriceSek: number | null;
};

export type NationDetail = {
  countryCode: string;
  countryName: string;
  /** All active players from this country, sorted by price desc within
   *  position. */
  players: NationPlayer[];
  /** "Best XI": 1 GK + 4 DEF + 3 MID + 3 FWD picked by current price,
   *  captain = most expensive FWD (or most expensive overall if no FWD). */
  startingEleven: {
    GK: NationPlayer[];
    DEF: NationPlayer[];
    MID: NationPlayer[];
    FWD: NationPlayer[];
    captainId: string | null;
  };
};

/**
 * Loads everything a /landslag/[code] page needs in one round-trip.
 * Returns null when no club/team with that ISO code exists.
 */
export async function getNationDetail(
  countryCode: string,
): Promise<NationDetail | null> {
  const code = countryCode.toUpperCase();
  // The country lives on the `clubs` row (clubs.countryCode); for WC fantasy
  // every "club" is a national team, so one club per country code.
  const [club] = await db
    .select()
    .from(clubs)
    .where(eq(clubs.countryCode, code))
    .limit(1);
  if (!club) return null;

  const [allPlayers, allRounds, allSnapshots] = await Promise.all([
    db
      .select()
      .from(players)
      .where(eq(players.clubId, club.id))
      .orderBy(asc(players.name)),
    db.select().from(rounds).orderBy(asc(rounds.number)),
    db.select().from(playerRoundSnapshots),
  ]);

  const baseRoundId = allRounds[0]?.id;
  const latestRoundId = allRounds[allRounds.length - 1]?.id;
  const playerIds = new Set(allPlayers.map((p) => p.id));

  // Manual wins over API for the same (round, player).
  const baselineByPlayer = new Map<string, number>();
  const latestByPlayer = new Map<string, number>();
  const baselineSource = new Map<string, "api" | "manual">();
  const latestSource = new Map<string, "api" | "manual">();
  for (const s of allSnapshots) {
    if (!playerIds.has(s.playerId)) continue;
    if (s.roundId === baseRoundId) {
      const prevSrc = baselineSource.get(s.playerId);
      if (!prevSrc || (prevSrc === "api" && s.source === "manual")) {
        baselineByPlayer.set(s.playerId, s.priceSek);
        baselineSource.set(s.playerId, s.source);
      }
    }
    if (s.roundId === latestRoundId) {
      const prevSrc = latestSource.get(s.playerId);
      if (!prevSrc || (prevSrc === "api" && s.source === "manual")) {
        latestByPlayer.set(s.playerId, s.priceSek);
        latestSource.set(s.playerId, s.source);
      }
    }
  }

  const nationPlayers: NationPlayer[] = allPlayers
    .filter((p: Player) => p.active)
    .map((p: Player) => ({
      id: p.id,
      name: p.name,
      position: p.position,
      priceSek: latestByPlayer.get(p.id) ?? baselineByPlayer.get(p.id) ?? null,
      basePriceSek: baselineByPlayer.get(p.id) ?? null,
    }));

  const priceOf = (p: NationPlayer) => p.priceSek ?? p.basePriceSek ?? -Infinity;

  // Best XI: most expensive per position. 4-3-3 default — the most popular
  // formation in the picker, also gives a nice symmetric pitch.
  const byPos = {
    GK: nationPlayers.filter((p) => p.position === "GK"),
    DEF: nationPlayers.filter((p) => p.position === "DEF"),
    MID: nationPlayers.filter((p) => p.position === "MID"),
    FWD: nationPlayers.filter((p) => p.position === "FWD"),
  };
  for (const k of Object.keys(byPos) as (keyof typeof byPos)[]) {
    byPos[k].sort((a, b) => priceOf(b) - priceOf(a));
  }
  const startingEleven = {
    GK: byPos.GK.slice(0, 1),
    DEF: byPos.DEF.slice(0, 4),
    MID: byPos.MID.slice(0, 3),
    FWD: byPos.FWD.slice(0, 3),
    captainId:
      byPos.FWD[0]?.id ??
      [...byPos.MID, ...byPos.DEF, ...byPos.GK].sort(
        (a, b) => priceOf(b) - priceOf(a),
      )[0]?.id ??
      null,
  };

  // Full roster is sorted by position GK→FWD then price desc.
  const order = { GK: 0, DEF: 1, MID: 2, FWD: 3 } as const;
  nationPlayers.sort((a, b) => {
    if (order[a.position] !== order[b.position]) {
      return order[a.position] - order[b.position];
    }
    return priceOf(b) - priceOf(a);
  });

  return {
    countryCode: code,
    countryName: club.name,
    players: nationPlayers,
    startingEleven,
  };
}

/**
 * Index page support: every country we have a club row for, with player
 * counts so the index can show a quick stat.
 */
export async function getAllNations(): Promise<
  { countryCode: string; countryName: string; playerCount: number }[]
> {
  const [allClubs, allPlayers] = await Promise.all([
    db.select().from(clubs),
    db.select().from(players).where(eq(players.active, true)),
  ]);
  const countByClub = new Map<string, number>();
  for (const p of allPlayers) {
    if (!p.clubId) continue;
    countByClub.set(p.clubId, (countByClub.get(p.clubId) ?? 0) + 1);
  }
  return allClubs
    .filter((c) => c.countryCode != null)
    .map((c) => ({
      countryCode: c.countryCode!,
      countryName: c.name,
      playerCount: countByClub.get(c.id) ?? 0,
    }));
}
