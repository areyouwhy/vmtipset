import { and, asc, eq } from "drizzle-orm";
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
};

export async function getActiveRound(): Promise<Round | null> {
  const all = await db.select().from(rounds).orderBy(asc(rounds.number));
  return all.find((r) => r.status !== "scored") ?? null;
}

export async function getPickablePlayers(
  roundId: string,
): Promise<PickablePlayer[]> {
  const [allPlayers, allClubs, allSnapshots] = await Promise.all([
    db.select().from(players).where(eq(players.active, true)),
    db.select().from(clubs),
    db
      .select()
      .from(playerRoundSnapshots)
      .where(eq(playerRoundSnapshots.roundId, roundId)),
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

  return allPlayers
    .flatMap((p) => {
      const snap = snapshotByPlayer.get(p.id);
      if (!snap) return [];
      const club = p.clubId ? clubById.get(p.clubId) : null;
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
        },
      ];
    })
    .sort((a, b) => b.priceSek - a.priceSek);
}

export type CurrentSquad = {
  squadId: string;
  playerIds: string[];
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

  return {
    squadId: squad.id,
    playerIds: sps.map((sp) => sp.playerId),
    captainPlayerId: squad.captainPlayerId,
    lockedAt: squad.lockedAt,
  };
}
