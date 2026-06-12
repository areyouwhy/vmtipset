import { and, asc, eq, isNull } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { clubFor } from "@/data/player-clubs";
import { db } from "@/db";
import {
  clubs,
  eventTypes,
  playerRoundSnapshots,
  players,
  rounds,
  squadPlayers,
  squads,
  type Player,
  type Club,
  type EventType,
  type Round,
  type PlayerRoundSnapshot,
} from "@/db/schema";

export type PlayerSeasonStats = {
  /** Aggregate event counts across all rounds (manual wins over api per round).
   *  Zero pre-match. */
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number; // includes 2nd yellow
  shotsOnGoal: number;
  saves: number;
  manOfTheMatch: number;
  /** Σ growthSek across rounds, signed. */
  totalGrowthSek: number;
};

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
  /** Per-round growth from the latest round's snapshot (Aftonbladet's
   *  "värdeökning" column). 0 if no snapshot for the latest round. */
  latestGrowthSek: number;
  /** Popularity at the latest snapshot — raw count of Aftonbladet squads
   *  owning this player. */
  popularity: number;
  /** −1 / 0 / +1 trend indicator from the latest snapshot. */
  trend: number;
  /** Number of OUR squads (in the latest round with picks) owning this player. */
  ourPickCount: number;
  /** Number of OUR squads (in the latest round) with this player as captain. */
  ourCaptainCount: number;
  /** Denominator for the two above — how many squads exist in the latest
   *  round with picks. 0 if nobody has picked yet. */
  ourSquadDenominator: number;
  stats: PlayerSeasonStats;
};

/** Names from Aftonbladet's eventTypes catalog that we track as stats. */
const STAT_EVENT_NAMES = {
  goals: "Goal",
  assists: "Assist",
  yellowCards: "YellowCard",
  redCards: "RedCard",
  secondYellowCards: "SecondYellowCard",
  shotsOnGoal: "ShotOnGoal",
  saves: "SaveByGoalkeeper",
  manOfTheMatch: "ManOfTheMatch",
} as const;

function emptyStats(): PlayerSeasonStats {
  return {
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    shotsOnGoal: 0,
    saves: 0,
    manOfTheMatch: 0,
    totalGrowthSek: 0,
  };
}

/** Pick the best (manual > api) snapshot per (player, round). Then build a
 *  stat-name → eventTypeId map from the in-memory catalog and tally event
 *  amounts across rounds per player. */
function aggregateStats(
  snapshots: PlayerRoundSnapshot[],
  eventTypeRows: { id: number; name: string }[],
): Map<string, PlayerSeasonStats> {
  // Pick best snapshot per (player, round)
  const bestByPlayerRound = new Map<string, PlayerRoundSnapshot>();
  for (const s of snapshots) {
    const k = `${s.playerId}::${s.roundId}`;
    const cur = bestByPlayerRound.get(k);
    if (!cur || (cur.source === "api" && s.source === "manual")) {
      bestByPlayerRound.set(k, s);
    }
  }
  const idByName = new Map(eventTypeRows.map((t) => [t.name, t.id]));
  const ids = {
    goal: idByName.get(STAT_EVENT_NAMES.goals),
    assist: idByName.get(STAT_EVENT_NAMES.assists),
    yellow: idByName.get(STAT_EVENT_NAMES.yellowCards),
    red: idByName.get(STAT_EVENT_NAMES.redCards),
    yellow2: idByName.get(STAT_EVENT_NAMES.secondYellowCards),
    shot: idByName.get(STAT_EVENT_NAMES.shotsOnGoal),
    save: idByName.get(STAT_EVENT_NAMES.saves),
    motm: idByName.get(STAT_EVENT_NAMES.manOfTheMatch),
  };

  const byPlayer = new Map<string, PlayerSeasonStats>();
  for (const s of bestByPlayerRound.values()) {
    const cur = byPlayer.get(s.playerId) ?? emptyStats();
    cur.totalGrowthSek += s.growthSek;
    for (const e of s.events ?? []) {
      const a = e.amount;
      switch (e.typeId) {
        case ids.goal:
          cur.goals += a;
          break;
        case ids.assist:
          cur.assists += a;
          break;
        case ids.yellow:
          cur.yellowCards += a;
          break;
        case ids.red:
        case ids.yellow2:
          cur.redCards += a;
          break;
        case ids.shot:
          cur.shotsOnGoal += a;
          break;
        case ids.save:
          cur.saves += a;
          break;
        case ids.motm:
          cur.manOfTheMatch += a;
          break;
      }
    }
    byPlayer.set(s.playerId, cur);
  }
  return byPlayer;
}

/**
 * Fetch players with derived list-friendly fields. Public callers leave
 * `includeInactive` off and get only active players; admin passes true to
 * see everyone (used for finding players Aftonbladet has dropped).
 */
export const getPlayerListRows = unstable_cache(
  _getPlayerListRows,
  ["player-list-rows"],
  { tags: ["players", "snapshots", "rounds"], revalidate: 3600 },
);

async function _getPlayerListRows(
  opts: { includeInactive?: boolean } = {},
): Promise<PlayerListRow[]> {
  const [allPlayers, allClubs, allRounds, allSnapshots, allEventTypeRows, allSquads, allSquadPlayers] = await Promise.all([
    opts.includeInactive
      ? db.select().from(players).orderBy(asc(players.name))
      : db
          .select()
          .from(players)
          .where(and(eq(players.active, true), isNull(players.archivedAt)))
          .orderBy(asc(players.name)),
    db.select().from(clubs),
    db.select().from(rounds).orderBy(asc(rounds.number)),
    db.select().from(playerRoundSnapshots),
    db.select({ id: eventTypes.id, name: eventTypes.name }).from(eventTypes),
    db.select().from(squads),
    db.select().from(squadPlayers),
  ]);

  const clubById = new Map(allClubs.map((c) => [c.id, c]));
  const statsByPlayer = aggregateStats(allSnapshots, allEventTypeRows);

  // OUR popularity / captain counts: use the latest round that has any
  // squad rows, so the number reflects "current state" of friend picks.
  const roundOrderIndex = new Map(allRounds.map((r, i) => [r.id, i] as const));
  let latestSquadRoundId: string | null = null;
  let latestSquadRoundIdx = -1;
  for (const sq of allSquads) {
    const idx = roundOrderIndex.get(sq.roundId) ?? -1;
    if (idx > latestSquadRoundIdx) {
      latestSquadRoundIdx = idx;
      latestSquadRoundId = sq.roundId;
    }
  }
  const latestSquads = latestSquadRoundId
    ? allSquads.filter((s) => s.roundId === latestSquadRoundId)
    : [];
  const latestSquadIds = new Set(latestSquads.map((s) => s.id));
  const ourPickCountByPlayer = new Map<string, number>();
  for (const sp of allSquadPlayers) {
    if (!latestSquadIds.has(sp.squadId)) continue;
    ourPickCountByPlayer.set(
      sp.playerId,
      (ourPickCountByPlayer.get(sp.playerId) ?? 0) + 1,
    );
  }
  const ourCaptainCountByPlayer = new Map<string, number>();
  for (const sq of latestSquads) {
    if (!sq.captainPlayerId) continue;
    ourCaptainCountByPlayer.set(
      sq.captainPlayerId,
      (ourCaptainCountByPlayer.get(sq.captainPlayerId) ?? 0) + 1,
    );
  }
  const ourSquadDenominator = latestSquads.length;
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
      latestGrowthSek: latestByPlayer.get(p.id)?.growthSek ?? 0,
      popularity: latestByPlayer.get(p.id)?.popularity ?? 0,
      trend: latestByPlayer.get(p.id)?.trend ?? 0,
      ourPickCount: ourPickCountByPlayer.get(p.id) ?? 0,
      ourCaptainCount: ourCaptainCountByPlayer.get(p.id) ?? 0,
      ourSquadDenominator,
      stats: statsByPlayer.get(p.id) ?? emptyStats(),
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
  /** Raw event-type catalog from Aftonbladet — {id, name, title, …}. Used to
   *  resolve human-friendly names for events stored on snapshots. Kept as a
   *  plain array (NOT a Map): this object is returned through `unstable_cache`,
   *  which serializes it — a Map would deserialize into a non-Map and crash
   *  `.get()` on cache hits. The page rebuilds the Map after the cache call. */
  eventTypes: EventType[];
  /** Season-aggregate event counts + total growth for this player. */
  stats: PlayerSeasonStats;
};

/**
 * Player detail + per-round snapshot map. Returns null when no player exists
 * with that id.
 */
export const getPlayerDetail = unstable_cache(
  _getPlayerDetail,
  ["player-detail"],
  { tags: ["players", "snapshots", "rounds"], revalidate: 3600 },
);

async function _getPlayerDetail(
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
    db.select().from(eventTypes),
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

  const playerSnapshots = allSnapshots; // already filtered by playerId above
  const eventTypeRows = allEventTypes.map((t) => ({ id: t.id, name: t.name }));
  const statsMap = aggregateStats(playerSnapshots, eventTypeRows);

  return {
    player,
    club,
    rounds: roundLines,
    eventTypes: allEventTypes,
    stats: statsMap.get(player.id) ?? emptyStats(),
  };
}
