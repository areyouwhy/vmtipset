import { and, asc, eq, inArray } from "drizzle-orm";
import { clubFor } from "@/data/player-clubs";
import { db } from "@/db";
import {
  clubs,
  playerRoundSnapshots,
  players,
  rounds,
  squadPlayers,
  squads,
  type Position,
  type Round,
} from "@/db/schema";

export type PickablePlayer = {
  id: string;
  name: string;
  position: Position;
  clubId: string | null;
  clubName: string;
  clubShortName: string;
  clubExternalId: string | null;
  countryCode: string | null;
  priceSek: number;
  /** Round growth (this round's delta in SEK). */
  growthSek: number;
  /** Cumulative growth through this round. */
  totalGrowthSek: number;
  /** Raw count of teams owning this player. */
  popularity: number;
  /** Percent of Aftonbladet's WC fantasy squads that own this player, in
   *  this round. Computed from popularity / (Σpopularity / squadSize).
   *  Already in 0–100 space; render with Math.ceil to avoid "0%" noise. */
  abPopularityPct: number;
  /** Percent of *our* (Copa-internal) squads in this round that own this
   *  player. 0–100 space, same Math.ceil rule for display. */
  ourPopularityPct: number;
  /** -1 / 0 / +1. */
  trend: number;
  /** Domestic club at WC time (e.g. "Inter Miami CF"). null if unknown.
   *  Static lookup keyed by Aftonbladet player externalId. */
  domesticClub: string | null;
};

export async function getActiveRound(): Promise<Round | null> {
  const all = await db.select().from(rounds).orderBy(asc(rounds.number));
  const now = Date.now();

  // Prefer the next round whose deadline is still in the future and isn't
  // already scored. That's "the round users should be picking for".
  const upcoming = all.find(
    (r) =>
      r.status !== "scored" &&
      r.deadline !== null &&
      new Date(r.deadline).getTime() > now,
  );
  if (upcoming) return upcoming;

  // Fall back to any non-scored round (covers rounds without deadlines and
  // also "season already past, nothing scored" edge cases).
  return all.find((r) => r.status !== "scored") ?? null;
}

export async function getPickablePlayers(
  roundId: string,
): Promise<PickablePlayer[]> {
  const [allPlayers, allClubs, allSnapshots, ourSquads] = await Promise.all([
    db.select().from(players).where(eq(players.active, true)),
    db.select().from(clubs),
    db
      .select()
      .from(playerRoundSnapshots)
      .where(eq(playerRoundSnapshots.roundId, roundId)),
    db.select().from(squads).where(eq(squads.roundId, roundId)),
  ]);

  const clubById = new Map(allClubs.map((c) => [c.id, c]));

  // Manual snapshot wins over api when both exist for same (player, round).
  const snapshotByPlayer = new Map<string, (typeof allSnapshots)[number]>();
  for (const s of allSnapshots) {
    const prev = snapshotByPlayer.get(s.playerId);
    if (!prev || (prev.source === "api" && s.source === "manual")) {
      snapshotByPlayer.set(s.playerId, s);
    }
  }

  // Aftonbladet popularity is a raw count of squads owning this player on
  // their platform. To turn it into a percentage we infer their total
  // active-squad count for the round: each squad picks 11 players, so the
  // sum of popularities across all players in the round equals
  // (totalSquads × 11). Divide-by-zero pre-tournament → 0%.
  let abTotalPopularity = 0;
  for (const s of snapshotByPlayer.values()) abTotalPopularity += s.popularity;
  const SQUAD_SIZE = 11;
  const abActiveSquads = abTotalPopularity > 0 ? abTotalPopularity / SQUAD_SIZE : 0;

  // Our own popularity = count of *our* round squads owning the player.
  const ourSquadIds = ourSquads.map((s) => s.id);
  const ourCountByPlayer = new Map<string, number>();
  if (ourSquadIds.length > 0) {
    const sps = await db
      .select()
      .from(squadPlayers)
      .where(inArray(squadPlayers.squadId, ourSquadIds));
    for (const sp of sps) {
      ourCountByPlayer.set(
        sp.playerId,
        (ourCountByPlayer.get(sp.playerId) ?? 0) + 1,
      );
    }
  }
  const ourTotal = ourSquads.length;

  return allPlayers
    .flatMap((p) => {
      const snap = snapshotByPlayer.get(p.id);
      if (!snap) return [];
      const club = p.clubId ? clubById.get(p.clubId) : null;
      const abPct =
        abActiveSquads > 0 ? (snap.popularity / abActiveSquads) * 100 : 0;
      const ourCount = ourCountByPlayer.get(p.id) ?? 0;
      const ourPct = ourTotal > 0 ? (ourCount / ourTotal) * 100 : 0;
      return [
        {
          id: p.id,
          name: p.name,
          position: p.position,
          clubId: p.clubId,
          clubName: club?.name ?? "—",
          clubShortName: club?.shortName ?? club?.name ?? "—",
          clubExternalId: club?.externalId ?? null,
          countryCode: club?.countryCode ?? null,
          priceSek: snap.priceSek,
          growthSek: snap.growthSek,
          totalGrowthSek: snap.totalGrowthSek,
          popularity: snap.popularity,
          abPopularityPct: abPct,
          ourPopularityPct: ourPct,
          trend: snap.trend,
          domesticClub: clubFor(p.externalId),
        },
      ];
    })
    .sort((a, b) => b.priceSek - a.priceSek);
}

export type CurrentSquad = {
  squadId: string;
  /** All squad_players rows, including any whose underlying player is now
   *  inactive (dropped from the WC pool by Aftonbladet). The picker filters
   *  these out before display; use droppedPlayers to surface the fact. */
  playerIds: string[];
  /** Subset of playerIds whose player.active = false. Pre-round-1 the user
   *  needs to swap these for free; mid-tournament they get auto-replaced
   *  via the normal transfer flow. */
  droppedPlayers: { id: string; name: string }[];
  captainPlayerId: string | null;
  lockedAt: Date | null;
};

export async function getCurrentSquad(
  teamId: string,
  roundId: string,
): Promise<CurrentSquad | null> {
  const [squad] = await db
    .select()
    .from(squads)
    .where(and(eq(squads.teamId, teamId), eq(squads.roundId, roundId)))
    .limit(1);
  if (!squad) return null;

  const sps = await db
    .select()
    .from(squadPlayers)
    .where(eq(squadPlayers.squadId, squad.id));
  const ids = sps.map((sp) => sp.playerId);

  // Look up which of these have been deactivated.
  const dropped: { id: string; name: string }[] = [];
  if (ids.length > 0) {
    const rows = await db
      .select({ id: players.id, name: players.name, active: players.active })
      .from(players)
      .where(inArray(players.id, ids));
    for (const r of rows) {
      if (!r.active) dropped.push({ id: r.id, name: r.name });
    }
  }

  return {
    squadId: squad.id,
    playerIds: ids,
    droppedPlayers: dropped,
    captainPlayerId: squad.captainPlayerId,
    lockedAt: squad.lockedAt,
  };
}
