import { asc, eq } from "drizzle-orm";
import { clubFor } from "@/data/player-clubs";
import { db } from "@/db";
import {
  clubs,
  fantasyEventTypes,
  playerRoundSnapshots,
  players,
  rounds,
  type Player,
  type Club,
  type FantasyEventType,
  type Round,
  type PlayerRoundSnapshot,
} from "@/db/schema";

export type PlayerListRow = {
  id: string;
  name: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  countryCode: string | null;
  clubShortName: string;
  clubName: string;
  /** Price from the baseline (first) round's snapshot — what the player starts at. */
  basePriceSek: number | null;
  /** Latest round's snapshot price (the "current" price). null if no snapshot yet. */
  currentPriceSek: number | null;
  /** Count of manual admin overrides across all rounds (0 for clean data). */
  manualOverrides: number;
  /** Domestic club at WC time (e.g. "Inter Miami CF"); null if unknown. */
  domesticClub: string | null;
  /** Whether the player is in an active WC pool. Admin can see false ones;
   *  public /spelare only ever calls this with includeInactive=false. */
  active: boolean;
};

/**
 * Fetch players with derived list-friendly fields. Public callers leave
 * `includeInactive` off and get only active players; admin passes true to
 * see everyone (used for finding players Aftonbladet has dropped).
 */
export async function getPlayerListRows(
  opts: { includeInactive?: boolean } = {},
): Promise<PlayerListRow[]> {
  const [allPlayers, allClubs, allRounds, allSnapshots] = await Promise.all([
    opts.includeInactive
      ? db.select().from(players).orderBy(asc(players.name))
      : db
          .select()
          .from(players)
          .where(eq(players.active, true))
          .orderBy(asc(players.name)),
    db.select().from(clubs),
    db.select().from(rounds).orderBy(asc(rounds.number)),
    db.select().from(playerRoundSnapshots),
  ]);

  const clubById = new Map(allClubs.map((c) => [c.id, c]));
  const baseRoundId = allRounds[0]?.id;
  const latestRoundId = allRounds[allRounds.length - 1]?.id;

  // For each (round, player), keep the highest-priority snapshot (manual > api).
  const pickBest = (
    a: PlayerRoundSnapshot | undefined,
    b: PlayerRoundSnapshot,
  ): PlayerRoundSnapshot =>
    a === undefined || (a.source === "api" && b.source === "manual") ? b : a;

  const baselineByPlayer = new Map<string, PlayerRoundSnapshot>();
  const latestByPlayer = new Map<string, PlayerRoundSnapshot>();
  const manualCountByPlayer = new Map<string, number>();
  for (const s of allSnapshots) {
    if (s.roundId === baseRoundId) {
      baselineByPlayer.set(s.playerId, pickBest(baselineByPlayer.get(s.playerId), s));
    }
    if (s.roundId === latestRoundId) {
      latestByPlayer.set(s.playerId, pickBest(latestByPlayer.get(s.playerId), s));
    }
    if (s.source === "manual") {
      manualCountByPlayer.set(
        s.playerId,
        (manualCountByPlayer.get(s.playerId) ?? 0) + 1,
      );
    }
  }

  return allPlayers.map((p) => {
    const club = p.clubId ? (clubById.get(p.clubId) ?? null) : null;
    return {
      id: p.id,
      name: p.name,
      position: p.position,
      countryCode: club?.countryCode ?? null,
      clubShortName: club?.shortName ?? club?.name ?? "—",
      clubName: club?.name ?? "—",
      basePriceSek: baselineByPlayer.get(p.id)?.priceSek ?? null,
      currentPriceSek: latestByPlayer.get(p.id)?.priceSek ?? null,
      manualOverrides: manualCountByPlayer.get(p.id) ?? 0,
      domesticClub: clubFor(p.externalId),
      active: p.active,
    };
  });
}

export type PlayerDetailRoundSnapshot = {
  roundId: string;
  roundNumber: number;
  roundName: string;
  api: PlayerRoundSnapshot | null;
  manual: PlayerRoundSnapshot | null;
};

export type PlayerDetail = {
  player: Player;
  club: Club | null;
  rounds: PlayerDetailRoundSnapshot[];
  /** Catalog of fantasy event types from Aftonbladet — name + SEK value.
   *  Keyed by event type id. Empty if ingest hasn't run yet. */
  eventTypes: Map<number, FantasyEventType>;
};

/**
 * Player detail + per-round snapshot map. Returns null when no player exists
 * with that id.
 */
export async function getPlayerDetail(
  playerId: string,
): Promise<PlayerDetail | null> {
  const [player] = await db
    .select()
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);
  if (!player) return null;

  const [allRounds, allSnapshots, club, allEventTypes] = await Promise.all([
    db.select().from(rounds).orderBy(asc(rounds.number)),
    db
      .select()
      .from(playerRoundSnapshots)
      .where(eq(playerRoundSnapshots.playerId, playerId)),
    player.clubId
      ? db
          .select()
          .from(clubs)
          .where(eq(clubs.id, player.clubId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve<Club | null>(null),
    db.select().from(fantasyEventTypes),
  ]);

  const byRound = new Map<
    string,
    { api: PlayerRoundSnapshot | null; manual: PlayerRoundSnapshot | null }
  >();
  for (const s of allSnapshots) {
    const cur = byRound.get(s.roundId) ?? { api: null, manual: null };
    if (s.source === "api") cur.api = s;
    else cur.manual = s;
    byRound.set(s.roundId, cur);
  }

  const roundLines: PlayerDetailRoundSnapshot[] = allRounds.map((r: Round) => {
    const both = byRound.get(r.id) ?? { api: null, manual: null };
    return {
      roundId: r.id,
      roundNumber: r.number,
      roundName: r.name,
      api: both.api,
      manual: both.manual,
    };
  });

  return {
    player,
    club,
    rounds: roundLines,
    eventTypes: new Map(allEventTypes.map((t) => [t.id, t])),
  };
}
