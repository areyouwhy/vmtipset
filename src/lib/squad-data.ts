import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { clubFor } from "@/data/player-clubs";
import { db } from "@/db";
import {
  clubs,
  playerRoundSnapshots,
  players,
  rounds,
  squadPlayers,
  squads,
  transfers,
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
  // Fully manual lifecycle: the live trading round is whichever one the admin
  // has OPENED (status `open`). Deadlines are display-only and no longer decide
  // what's active. No open round → no transfer window (between rounds, or a
  // round the admin hasn't opened yet).
  const all = await db.select().from(rounds).orderBy(asc(rounds.number));
  return all.find((r) => r.status === "open") ?? null;
}

/**
 * The team's most recent squad and the round it belongs to — i.e. their
 * "current team" regardless of whether a round is open. Used between rounds
 * to show the locked squad read-only (no open round → no active round, but
 * the player should still see what they're holding).
 */
export async function getLatestSquadForTeam(
  teamId: string,
): Promise<{ round: Round; squad: CurrentSquad } | null> {
  const [row] = await db
    .select({ round: rounds })
    .from(squads)
    .innerJoin(rounds, eq(rounds.id, squads.roundId))
    .where(eq(squads.teamId, teamId))
    .orderBy(desc(rounds.number))
    .limit(1);
  if (!row) return null;
  const squad = await getCurrentSquad(teamId, row.round.id);
  if (!squad) return null;
  return { round: row.round, squad };
}

export async function getPickablePlayers(
  roundId: string,
): Promise<PickablePlayer[]> {
  const [allPlayers, allClubs, allSnapshots, ourSquads] = await Promise.all([
    db
      .select()
      .from(players)
      .where(and(eq(players.active, true), isNull(players.archivedAt))),
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

  // Aftonbladet now returns popularity as a fraction (0..1) of all their
  // squads owning this player. Render as a percentage directly.

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
      const abPct = snap.popularity * 100;
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
  /** Subset of playerIds whose player is no longer pickable — either
   *  manually deactivated (active=false) or archived by the ingest
   *  (archivedAt set). Pre-round-1 the user needs to swap these for free;
   *  mid-tournament they get auto-replaced via the normal transfer flow. */
  droppedPlayers: { id: string; name: string }[];
  captainPlayerId: string | null;
  lockedAt: Date | null;
  /** True once the ingest detected that one of this squad's players got
   *  archived. UI surfaces a banner with `invalidReason` until the user
   *  rebuilds the squad. */
  invalid: boolean;
  invalidReason: string | null;
};

export type PendingTransfer = {
  /** `transfers` row id — useful for keys. */
  id: string;
  playerOut: { id: string; name: string; position: "GK" | "DEF" | "MID" | "FWD" };
  playerIn: { id: string; name: string; position: "GK" | "DEF" | "MID" | "FWD" };
  sellPriceSek: number;
  buyPriceSek: number;
  feeSek: number;
};

export type PendingTransfersForRound = {
  transfers: PendingTransfer[];
  totalFeeSek: number;
  /** Σ (sell − buy) — positive = cash into bank, negative = bank shrinks. */
  totalCashFlowSek: number;
};

/**
 * Transfer rows currently saved for this team's round. These are "pending"
 * in the sense that the round isn't locked yet — the user can still revise
 * (each save replaces the whole set), but once the deadline passes whatever's
 * saved here becomes final.
 */
export async function getPendingTransfersForTeamRound(
  teamId: string,
  roundId: string,
): Promise<PendingTransfersForRound> {
  const rows = await db
    .select()
    .from(transfers)
    .where(and(eq(transfers.teamId, teamId), eq(transfers.roundId, roundId)));
  if (rows.length === 0) {
    return { transfers: [], totalFeeSek: 0, totalCashFlowSek: 0 };
  }
  const playerIds = Array.from(
    new Set(rows.flatMap((r) => [r.playerInId, r.playerOutId])),
  );
  const playerRows = await db
    .select({ id: players.id, name: players.name, position: players.position })
    .from(players)
    .where(inArray(players.id, playerIds));
  const byId = new Map(playerRows.map((p) => [p.id, p]));

  const out: PendingTransfer[] = rows.map((r) => ({
    id: r.id,
    playerOut: byId.get(r.playerOutId) ?? {
      id: r.playerOutId,
      name: "?",
      position: "GK" as const,
    },
    playerIn: byId.get(r.playerInId) ?? {
      id: r.playerInId,
      name: "?",
      position: "GK" as const,
    },
    sellPriceSek: r.sellPriceSek,
    buyPriceSek: r.buyPriceSek,
    feeSek: r.feeSek,
  }));
  return {
    transfers: out,
    totalFeeSek: out.reduce((acc, t) => acc + t.feeSek, 0),
    totalCashFlowSek: out.reduce(
      (acc, t) => acc + (t.sellPriceSek - t.buyPriceSek),
      0,
    ),
  };
}

/**
 * Returns the squad's player ids from the round PRECEDING the given round,
 * for transfer-diff purposes. null if there is no prior round (Round 1) or
 * the team didn't have a squad in any prior round.
 */
export async function getPreviousRoundSquadPlayerIds(
  teamId: string,
  currentRoundNumber: number,
): Promise<string[] | null> {
  if (currentRoundNumber <= 1) return null;
  const earlier = await db
    .select()
    .from(rounds)
    .where(eq(rounds.number, currentRoundNumber - 1))
    .limit(1);
  if (earlier.length === 0) return null;
  const prev = await getCurrentSquad(teamId, earlier[0].id);
  return prev?.playerIds ?? null;
}

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

  // Look up which of these are no longer pickable (manual deactivate OR
  // ingest-archived).
  const dropped: { id: string; name: string }[] = [];
  if (ids.length > 0) {
    const rows = await db
      .select({
        id: players.id,
        name: players.name,
        active: players.active,
        archivedAt: players.archivedAt,
      })
      .from(players)
      .where(inArray(players.id, ids));
    for (const r of rows) {
      if (!r.active || r.archivedAt) dropped.push({ id: r.id, name: r.name });
    }
  }

  return {
    squadId: squad.id,
    playerIds: ids,
    droppedPlayers: dropped,
    captainPlayerId: squad.captainPlayerId,
    lockedAt: squad.lockedAt,
    invalid: squad.invalid,
    invalidReason: squad.invalidReason,
  };
}
