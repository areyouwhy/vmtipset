import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/db";
import {
  clubs,
  playerRoundSnapshots,
  players,
  rounds,
  squadPlayers,
  squads,
  type Player,
} from "@/db/schema";
import { getRejectedTeamIds } from "@/lib/active-teams";

/**
 * Minimal projection of a snapshot row — just what the price-map builders
 * need. Skips the `events` jsonb column (biggest field per row) and other
 * unused metadata, so an unfiltered table dump goes from a few MB to a
 * few hundred KB.
 */
type SnapshotPriceRow = {
  playerId: string;
  roundId: string;
  priceSek: number;
  /** Cumulative value change through this round (vs the player's start price). */
  totalGrowthSek: number;
  popularity: number;
  source: "api" | "manual";
};
import { currentRules } from "@/lib/rules";
import {
  getAllMatches,
  getTeamLookup,
  type WcMatch,
  type WcTeam,
} from "@/lib/wc-tournament";

export type NationPlayer = {
  id: string;
  /** Aftonbladet external id, e.g. "ab:p:248321" — used for club lookup. */
  externalId: string | null;
  name: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  /** Most recent snapshot price; falls back to baseline; null if none. */
  priceSek: number | null;
  basePriceSek: number | null;
  /** Cumulative value change over the tournament (latest snapshot's
   *  totalGrowthSek). null when there's no snapshot. */
  growthSek: number | null;
  /** Aftonbladet global ownership %. */
  abPopularityPct: number;
  /** How many of OUR teams own this player in the latest played round. */
  ourOwnerCount: number;
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
  /** "Best XI" under the most expensive legal formation. Captain = most
   *  expensive FWD (or most expensive overall if no FWD picked). */
  startingEleven: StartingEleven;
  /** The formation actually chosen (def-mid-fwd). null when the roster
   *  can't fill any legal shape. */
  dreamTeamFormation: { def: number; mid: number; fwd: number } | null;
  /** Sum of priceSek across the 11 best-XI players. null if no valid XI
   *  could be built (roster too short or prices missing). */
  dreamTeamValueSek: number | null;
  /** WC matches involving this team, ordered by kickoff. Populated from
   *  the WC tournament feed (separate id space from our clubs table —
   *  matched by ISO country code). Empty if no matches found. */
  matches: WcMatch[];
  /** WC teams for resolving the opponent's name + jersey in the match list.
   *  Kept as a plain array (NOT a Map) because this object passes through
   *  `unstable_cache`, which serializes it — a Map would come back as a
   *  non-Map and crash `.get()` on cache hits. The page rebuilds the Map. */
  wcTeams: WcTeam[];
  /** Latest played round these our-game figures reflect; null if none played. */
  latestRoundNumber: number | null;
  /** Σ current price across the roster. */
  squadValueSek: number;
  /** Σ cumulative growth across the roster. */
  totalGrowthSek: number;
  /** Distinct OUR teams owning ≥1 player from this nation (latest played round). */
  ownedByTeamCount: number;
  /** Total OUR teams with a squad that round. */
  ourTeamTotal: number;
  /** Roster player our teams pick most. */
  mostPicked: { id: string; name: string; count: number } | null;
};

function priceOf(p: NationPlayer): number {
  return p.priceSek ?? p.basePriceSek ?? -Infinity;
}

/**
 * Pick the highest-value legal starting XI for this roster. Tries every
 * formation allowed by the rules (4-3-3, 4-4-2, 3-5-2, etc.) and keeps
 * the one whose top-N picks per position sum to the most. Pure function —
 * no IO. Returns null formation/value when no legal shape fits.
 */
function buildDreamTeam(roster: NationPlayer[]): {
  startingEleven: StartingEleven;
  dreamTeamFormation: { def: number; mid: number; fwd: number } | null;
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

  // No goalkeeper at all → no legal XI.
  if (byPos.GK.length === 0) {
    return {
      startingEleven: {
        GK: [], DEF: [], MID: [], FWD: [], captainId: null,
      },
      dreamTeamFormation: null,
      dreamTeamValueSek: null,
    };
  }

  let best: {
    formation: { def: number; mid: number; fwd: number };
    xi: NationPlayer[];
    value: number;
    eleven: StartingEleven;
  } | null = null;

  for (const f of currentRules.legalFormations) {
    if (
      byPos.DEF.length < f.def ||
      byPos.MID.length < f.mid ||
      byPos.FWD.length < f.fwd
    ) {
      continue;
    }
    const gk = byPos.GK.slice(0, 1);
    const def = byPos.DEF.slice(0, f.def);
    const mid = byPos.MID.slice(0, f.mid);
    const fwd = byPos.FWD.slice(0, f.fwd);
    const xi = [...gk, ...def, ...mid, ...fwd];
    const anyMissing = xi.some(
      (p) => p.priceSek === null && p.basePriceSek === null,
    );
    if (anyMissing) continue;
    const value = xi.reduce(
      (acc, p) => acc + (p.priceSek ?? p.basePriceSek ?? 0),
      0,
    );
    const eleven: StartingEleven = {
      GK: gk,
      DEF: def,
      MID: mid,
      FWD: fwd,
      captainId:
        fwd[0]?.id ??
        [...mid, ...def, ...gk].sort((a, b) => priceOf(b) - priceOf(a))[0]?.id ??
        null,
    };
    if (!best || value > best.value) {
      best = { formation: f, xi, value, eleven };
    }
  }

  if (!best) {
    return {
      startingEleven: {
        GK: byPos.GK.slice(0, 1),
        DEF: byPos.DEF.slice(0, 4),
        MID: byPos.MID.slice(0, 3),
        FWD: byPos.FWD.slice(0, 3),
        captainId: null,
      },
      dreamTeamFormation: null,
      dreamTeamValueSek: null,
    };
  }
  return {
    startingEleven: best.eleven,
    dreamTeamFormation: best.formation,
    dreamTeamValueSek: best.value,
  };
}

/**
 * Build the latest-priority price map for a set of players. Manual wins over
 * API for the same (round, player); the most recent round wins overall.
 */
function buildPriceMaps(
  allSnapshots: SnapshotPriceRow[],
  baseRoundId: string | undefined,
  latestRoundId: string | undefined,
  playerIds: Set<string>,
): {
  baseline: Map<string, number>;
  latest: Map<string, number>;
  latestGrowth: Map<string, number>;
  latestPop: Map<string, number>;
} {
  const baseline = new Map<string, number>();
  const latest = new Map<string, number>();
  const latestGrowth = new Map<string, number>();
  const latestPop = new Map<string, number>();
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
        latestGrowth.set(s.playerId, s.totalGrowthSek);
        latestPop.set(s.playerId, s.popularity);
        latestSrc.set(s.playerId, s.source);
      }
    }
  }
  return { baseline, latest, latestGrowth, latestPop };
}

/**
 * Loads everything a /landslag/[code] page needs in one round-trip.
 * Returns null when no club/team with that ISO code exists.
 */
export const getNationDetail = unstable_cache(
  _getNationDetail,
  ["nation-detail"],
  { tags: ["players", "snapshots", "rounds", "clubs"], revalidate: 3600 },
);

async function _getNationDetail(
  countryCode: string,
): Promise<NationDetail | null> {
  const code = countryCode.toUpperCase();
  const [club] = await db
    .select()
    .from(clubs)
    .where(eq(clubs.countryCode, code))
    .limit(1);
  if (!club) return null;

  // Pull rounds first so we can filter the snapshot query to just the
  // two rounds we actually consume (base + latest). One extra RTT, much
  // less wire data.
  // base = round 1 (entry prices); latest = the latest PLAYED round (current
  // prices / growth / ownership). Rounds with no snapshots (e.g. round 8) would
  // otherwise show stale base prices.
  const allRounds = await db.select().from(rounds).orderBy(asc(rounds.number));
  const baseRound = allRounds[0] ?? null;
  const playedRounds = allRounds.filter(
    (r) => r.status === "locked" || r.status === "scored",
  );
  const latestRound = playedRounds.at(-1) ?? baseRound;
  const baseRoundId = baseRound?.id;
  const latestRoundId = latestRound?.id;
  const priceRoundIds = [
    ...new Set([baseRoundId, latestRoundId].filter((x): x is string => !!x)),
  ];

  const [allPlayers, allSnapshots, wcTeamsById, allMatches, rejected, latestSquads] =
    await Promise.all([
      db
        .select()
        .from(players)
        .where(eq(players.clubId, club.id))
        .orderBy(asc(players.name)),
      priceRoundIds.length > 0
        ? db
            .select({
              playerId: playerRoundSnapshots.playerId,
              roundId: playerRoundSnapshots.roundId,
              priceSek: playerRoundSnapshots.priceSek,
              totalGrowthSek: playerRoundSnapshots.totalGrowthSek,
              popularity: playerRoundSnapshots.popularity,
              source: playerRoundSnapshots.source,
            })
            .from(playerRoundSnapshots)
            .where(inArray(playerRoundSnapshots.roundId, priceRoundIds))
        : Promise.resolve<SnapshotPriceRow[]>([]),
      getTeamLookup(),
      getAllMatches(),
      getRejectedTeamIds(),
      latestRoundId
        ? db.select().from(squads).where(eq(squads.roundId, latestRoundId))
        : Promise.resolve<(typeof squads.$inferSelect)[]>([]),
    ]);

  // Match this nation to its WC team by ISO code. Fixtures we surface are
  // those where the team is either home or away.
  const wcTeam = [...wcTeamsById.values()].find((t) => t.code === code);
  const matches = wcTeam
    ? allMatches
        .filter(
          (m) =>
            m.homeTeamId === wcTeam.externalId ||
            m.awayTeamId === wcTeam.externalId,
        )
        .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
    : [];

  const playerIds = new Set(allPlayers.map((p) => p.id));
  const { baseline, latest, latestGrowth, latestPop } = buildPriceMaps(
    allSnapshots,
    baseRoundId,
    latestRoundId,
    playerIds,
  );

  // OUR-league ownership in the latest played round (rejected teams excluded).
  const ourSquads = latestSquads.filter((s) => !rejected.has(s.teamId));
  const squadTeam = new Map(ourSquads.map((s) => [s.id, s.teamId]));
  const ownerCountByPlayer = new Map<string, number>();
  const owningTeamsByPlayer = new Map<string, Set<string>>();
  if (ourSquads.length > 0) {
    const sps = await db
      .select()
      .from(squadPlayers)
      .where(
        inArray(
          squadPlayers.squadId,
          ourSquads.map((s) => s.id),
        ),
      );
    for (const sp of sps) {
      if (!playerIds.has(sp.playerId)) continue;
      ownerCountByPlayer.set(
        sp.playerId,
        (ownerCountByPlayer.get(sp.playerId) ?? 0) + 1,
      );
      const tid = squadTeam.get(sp.squadId);
      if (tid) {
        const set = owningTeamsByPlayer.get(sp.playerId) ?? new Set<string>();
        set.add(tid);
        owningTeamsByPlayer.set(sp.playerId, set);
      }
    }
  }

  const roster: NationPlayer[] = allPlayers
    // Mirror the "in the game" definition used by the squad picker + /spelare:
    // active AND not archived by the ingest (archived = dropped from the pool).
    .filter((p: Player) => p.active && !p.archivedAt)
    .map((p: Player) => {
      const priceSek = latest.get(p.id) ?? baseline.get(p.id) ?? null;
      const basePriceSek = baseline.get(p.id) ?? null;
      return {
        id: p.id,
        externalId: p.externalId,
        name: p.name,
        position: p.position,
        priceSek,
        basePriceSek,
        growthSek: latestGrowth.get(p.id) ?? null,
        abPopularityPct: (latestPop.get(p.id) ?? 0) * 100,
        ourOwnerCount: ownerCountByPlayer.get(p.id) ?? 0,
      };
    });

  const { startingEleven, dreamTeamFormation, dreamTeamValueSek } =
    buildDreamTeam(roster);

  // Full roster ordering: GK→FWD, then price desc.
  const order = { GK: 0, DEF: 1, MID: 2, FWD: 3 } as const;
  roster.sort((a, b) => {
    if (order[a.position] !== order[b.position]) {
      return order[a.position] - order[b.position];
    }
    return priceOf(b) - priceOf(a);
  });

  const teamsOwning = new Set<string>();
  for (const p of roster) {
    for (const tid of owningTeamsByPlayer.get(p.id) ?? []) teamsOwning.add(tid);
  }
  const mostPicked = roster.reduce<NationDetail["mostPicked"]>((best, p) => {
    if (p.ourOwnerCount <= 0) return best;
    if (!best || p.ourOwnerCount > best.count) {
      return { id: p.id, name: p.name, count: p.ourOwnerCount };
    }
    return best;
  }, null);

  return {
    countryCode: code,
    countryName: club.name,
    players: roster,
    startingEleven,
    dreamTeamFormation,
    dreamTeamValueSek,
    matches,
    wcTeams: [...wcTeamsById.values()],
    latestRoundNumber:
      playedRounds.length > 0 ? (latestRound?.number ?? null) : null,
    squadValueSek: roster.reduce((acc, p) => acc + (p.priceSek ?? 0), 0),
    totalGrowthSek: roster.reduce((acc, p) => acc + (p.growthSek ?? 0), 0),
    ownedByTeamCount: teamsOwning.size,
    ourTeamTotal: ourSquads.length,
    mostPicked,
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
export const getAllNations = unstable_cache(
  _getAllNations,
  ["all-nations"],
  { tags: ["players", "snapshots", "rounds", "clubs"], revalidate: 3600 },
);

async function _getAllNations(): Promise<NationSummary[]> {
  // base + latest PLAYED round (rounds with no snapshots would show stale base
  // prices otherwise).
  const allRounds = await db.select().from(rounds).orderBy(asc(rounds.number));
  const baseRoundId = allRounds[0]?.id;
  const latestRoundId =
    allRounds.filter((r) => r.status === "locked" || r.status === "scored").at(-1)
      ?.id ?? baseRoundId;
  const priceRoundIds = [
    ...new Set([baseRoundId, latestRoundId].filter((x): x is string => !!x)),
  ];

  const [allClubs, allPlayers, allSnapshots] = await Promise.all([
    db.select().from(clubs),
    db
      .select()
      .from(players)
      .where(and(eq(players.active, true), isNull(players.archivedAt))),
    priceRoundIds.length > 0
      ? db
          .select({
            playerId: playerRoundSnapshots.playerId,
            roundId: playerRoundSnapshots.roundId,
            priceSek: playerRoundSnapshots.priceSek,
            totalGrowthSek: playerRoundSnapshots.totalGrowthSek,
            popularity: playerRoundSnapshots.popularity,
            source: playerRoundSnapshots.source,
          })
          .from(playerRoundSnapshots)
          .where(inArray(playerRoundSnapshots.roundId, priceRoundIds))
      : Promise.resolve<SnapshotPriceRow[]>([]),
  ]);
  const allPlayerIds = new Set(allPlayers.map((p) => p.id));
  const { baseline, latest, latestGrowth } = buildPriceMaps(
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
        (p) => {
          const priceSek = latest.get(p.id) ?? baseline.get(p.id) ?? null;
          const basePriceSek = baseline.get(p.id) ?? null;
          return {
            id: p.id,
            externalId: p.externalId,
            name: p.name,
            position: p.position,
            priceSek,
            basePriceSek,
            growthSek: latestGrowth.get(p.id) ?? null,
            abPopularityPct: 0,
            ourOwnerCount: 0,
          };
        },
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
