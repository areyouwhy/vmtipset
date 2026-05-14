import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  clubs,
  playerRoundSnapshots,
  players,
  rounds,
  type Player,
  type PlayerRoundSnapshot,
} from "@/db/schema";

export type NationPlayer = {
  id: string;
  name: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  /** Most recent snapshot price; falls back to baseline; null if none. */
  priceSek: number | null;
  basePriceSek: number | null;
};

export type StartingEleven = {
  GK: NationPlayer[];
  DEF: NationPlayer[];
  MID: NationPlayer[];
  FWD: NationPlayer[];
  captainId: string | null;
};

export type NationDetail = {
  countryCode: string;
  countryName: string;
  /** All active players from this country, sorted by position then price. */
  players: NationPlayer[];
  /** "Best XI": 1 GK + 4 DEF + 3 MID + 3 FWD picked by current price,
   *  captain = most expensive FWD (or most expensive overall if no FWD). */
  startingEleven: StartingEleven;
  /** Sum of priceSek across the 11 best-XI players. null if any of those
   *  11 has no price (so we don't show a partial number). */
  dreamTeamValueSek: number | null;
};

function priceOf(p: NationPlayer): number {
  return p.priceSek ?? p.basePriceSek ?? -Infinity;
}

/**
 * Pick the most expensive starting XI (4-3-3) for a roster + flag whether
 * its total value is fully known. Pure function — no IO.
 */
function buildDreamTeam(roster: NationPlayer[]): {
  startingEleven: StartingEleven;
  dreamTeamValueSek: number | null;
} {
  const byPos = {
    GK: roster.filter((p) => p.position === "GK"),
    DEF: roster.filter((p) => p.position === "DEF"),
    MID: roster.filter((p) => p.position === "MID"),
    FWD: roster.filter((p) => p.position === "FWD"),
  };
  for (const k of Object.keys(byPos) as (keyof typeof byPos)[]) {
    byPos[k].sort((a, b) => priceOf(b) - priceOf(a));
  }
  const startingEleven: StartingEleven = {
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
  const xi = [
    ...startingEleven.GK,
    ...startingEleven.DEF,
    ...startingEleven.MID,
    ...startingEleven.FWD,
  ];
  // If we couldn't fill the formation (very small roster) the value is null.
  if (xi.length < 11) return { startingEleven, dreamTeamValueSek: null };
  const anyMissing = xi.some((p) => p.priceSek === null && p.basePriceSek === null);
  const total = xi.reduce((acc, p) => acc + (p.priceSek ?? p.basePriceSek ?? 0), 0);
  return {
    startingEleven,
    dreamTeamValueSek: anyMissing ? null : total,
  };
}

/**
 * Build the latest-priority price map for a set of players. Manual wins over
 * API for the same (round, player); the most recent round wins overall.
 */
function buildPriceMaps(
  allSnapshots: PlayerRoundSnapshot[],
  baseRoundId: string | undefined,
  latestRoundId: string | undefined,
  playerIds: Set<string>,
): {
  baseline: Map<string, number>;
  latest: Map<string, number>;
} {
  const baseline = new Map<string, number>();
  const latest = new Map<string, number>();
  const baselineSrc = new Map<string, "api" | "manual">();
  const latestSrc = new Map<string, "api" | "manual">();
  for (const s of allSnapshots) {
    if (!playerIds.has(s.playerId)) continue;
    if (s.roundId === baseRoundId) {
      const prev = baselineSrc.get(s.playerId);
      if (!prev || (prev === "api" && s.source === "manual")) {
        baseline.set(s.playerId, s.priceSek);
        baselineSrc.set(s.playerId, s.source);
      }
    }
    if (s.roundId === latestRoundId) {
      const prev = latestSrc.get(s.playerId);
      if (!prev || (prev === "api" && s.source === "manual")) {
        latest.set(s.playerId, s.priceSek);
        latestSrc.set(s.playerId, s.source);
      }
    }
  }
  return { baseline, latest };
}

/**
 * Loads everything a /landslag/[code] page needs in one round-trip.
 * Returns null when no club/team with that ISO code exists.
 */
export async function getNationDetail(
  countryCode: string,
): Promise<NationDetail | null> {
  const code = countryCode.toUpperCase();
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

  const playerIds = new Set(allPlayers.map((p) => p.id));
  const { baseline, latest } = buildPriceMaps(
    allSnapshots,
    allRounds[0]?.id,
    allRounds[allRounds.length - 1]?.id,
    playerIds,
  );

  const roster: NationPlayer[] = allPlayers
    .filter((p: Player) => p.active)
    .map((p: Player) => ({
      id: p.id,
      name: p.name,
      position: p.position,
      priceSek: latest.get(p.id) ?? baseline.get(p.id) ?? null,
      basePriceSek: baseline.get(p.id) ?? null,
    }));

  const { startingEleven, dreamTeamValueSek } = buildDreamTeam(roster);

  // Full roster ordering: GK→FWD, then price desc.
  const order = { GK: 0, DEF: 1, MID: 2, FWD: 3 } as const;
  roster.sort((a, b) => {
    if (order[a.position] !== order[b.position]) {
      return order[a.position] - order[b.position];
    }
    return priceOf(b) - priceOf(a);
  });

  return {
    countryCode: code,
    countryName: club.name,
    players: roster,
    startingEleven,
    dreamTeamValueSek,
  };
}

export type NationSummary = {
  countryCode: string;
  countryName: string;
  playerCount: number;
  /** Best-XI total value at current prices. null if not enough players or
   *  prices missing for the 11. */
  dreamTeamValueSek: number | null;
};

/**
 * Index-page support: every country we have a club row for, plus its best-XI
 * value. Single round-trip; reuses the same dream-team math as the detail
 * page so the two numbers always agree.
 */
export async function getAllNations(): Promise<NationSummary[]> {
  const [allClubs, allPlayers, allRounds, allSnapshots] = await Promise.all([
    db.select().from(clubs),
    db.select().from(players).where(eq(players.active, true)),
    db.select().from(rounds).orderBy(asc(rounds.number)),
    db.select().from(playerRoundSnapshots),
  ]);

  const baseRoundId = allRounds[0]?.id;
  const latestRoundId = allRounds[allRounds.length - 1]?.id;
  const allPlayerIds = new Set(allPlayers.map((p) => p.id));
  const { baseline, latest } = buildPriceMaps(
    allSnapshots,
    baseRoundId,
    latestRoundId,
    allPlayerIds,
  );

  // Bucket players by club id.
  const playersByClub = new Map<string, Player[]>();
  for (const p of allPlayers) {
    if (!p.clubId) continue;
    const arr = playersByClub.get(p.clubId) ?? [];
    arr.push(p);
    playersByClub.set(p.clubId, arr);
  }

  return allClubs
    .filter((c) => c.countryCode != null)
    .map((c) => {
      const roster: NationPlayer[] = (playersByClub.get(c.id) ?? []).map(
        (p) => ({
          id: p.id,
          name: p.name,
          position: p.position,
          priceSek: latest.get(p.id) ?? baseline.get(p.id) ?? null,
          basePriceSek: baseline.get(p.id) ?? null,
        }),
      );
      const { dreamTeamValueSek } = buildDreamTeam(roster);
      return {
        countryCode: c.countryCode!,
        countryName: c.name,
        playerCount: roster.length,
        dreamTeamValueSek,
      };
    });
}
