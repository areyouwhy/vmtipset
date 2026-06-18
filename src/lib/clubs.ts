import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { clubFor, PLAYER_CLUBS } from "@/data/player-clubs";
import { db } from "@/db";
import {
  clubs,
  players,
  playerRoundSnapshots,
  rounds,
  squadPlayers,
  squads,
  type Player,
} from "@/db/schema";
import { getRejectedTeamIds } from "@/lib/active-teams";

/** URL-safe slug for a club name. "Real Madrid CF" → "real-madrid-cf".
 *  Round-trippable via clubNameFromSlug() because we look the slug up
 *  in the de-duplicated PLAYER_CLUBS values. */
export function clubSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[.'’"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Reverse: find the canonical club name whose slug matches. Returns null
 *  if no PLAYER_CLUBS entry has that slug. */
export function clubNameFromSlug(slug: string): string | null {
  const target = slug.toLowerCase();
  for (const name of new Set(Object.values(PLAYER_CLUBS))) {
    if (clubSlug(name) === target) return name;
  }
  return null;
}

export type ClubSummary = {
  name: string;
  slug: string;
  playerCount: number;
};

export async function getAllClubs(): Promise<ClubSummary[]> {
  const counts = new Map<string, number>();
  for (const club of Object.values(PLAYER_CLUBS)) {
    counts.set(club, (counts.get(club) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, playerCount]) => ({
      name,
      slug: clubSlug(name),
      playerCount,
    }))
    .sort(
      (a, b) =>
        b.playerCount - a.playerCount || a.name.localeCompare(b.name, "sv"),
    );
}

export type ClubPlayer = {
  id: string;
  externalId: string | null;
  name: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  /** National team country code (e.g. "ARG") + display name. */
  countryCode: string | null;
  countryName: string | null;
  /** Current price (latest played round; falls back to base). */
  priceSek: number | null;
  basePriceSek: number | null;
  /** Cumulative SEK growth through the latest played round. */
  growthSek: number | null;
  /** Aftonbladet global ownership %. */
  abPopularityPct: number;
  /** How many of OUR teams own this player in the latest played round. */
  ourOwnerCount: number;
};

export type ClubDetail = {
  name: string;
  slug: string;
  players: ClubPlayer[];
  /** Latest played round these figures reflect, null if none played yet. */
  latestRoundNumber: number | null;
  /** Σ current price across the roster. */
  squadValueSek: number;
  /** Σ cumulative growth across the roster. */
  totalGrowthSek: number;
  /** Distinct OUR teams owning ≥1 player from this club (latest played round). */
  ownedByTeamCount: number;
  /** Total OUR teams with a squad that round (for context). */
  ourTeamTotal: number;
  /** Roster player our teams pick most. */
  mostPicked: { id: string; name: string; count: number } | null;
};

/** Returns the club's roster for the latest round's prices, sorted GK→FWD
 *  then by price desc. */
export const getClubDetail = unstable_cache(
  _getClubDetail,
  ["club-detail"],
  { tags: ["players", "snapshots", "rounds", "clubs"], revalidate: 3600 },
);

async function _getClubDetail(slug: string): Promise<ClubDetail | null> {
  const name = clubNameFromSlug(slug);
  if (!name) return null;

  // base = round 1 (entry prices); latest = the latest PLAYED round (current
  // prices / growth / ownership). Rounds 8 etc. have no snapshots, so using the
  // last-by-number would show stale base prices — use the last locked/scored.
  const allRounds = await db.select().from(rounds).orderBy(asc(rounds.number));
  const baseRound = allRounds[0] ?? null;
  const played = allRounds.filter(
    (r) => r.status === "locked" || r.status === "scored",
  );
  const latestRound = played.at(-1) ?? baseRound;
  const baseRoundId = baseRound?.id;
  const latestRoundId = latestRound?.id;
  const priceRoundIds = [
    ...new Set([baseRoundId, latestRoundId].filter((x): x is string => !!x)),
  ];

  const [allPlayers, allClubs, allSnapshots, rejected, latestSquads] =
    await Promise.all([
      db
        .select()
        .from(players)
        .where(and(eq(players.active, true), isNull(players.archivedAt))),
      db.select().from(clubs),
      priceRoundIds.length > 0
        ? db
            .select({
              playerId: playerRoundSnapshots.playerId,
              roundId: playerRoundSnapshots.roundId,
              priceSek: playerRoundSnapshots.priceSek,
              totalGrowthSek: playerRoundSnapshots.totalGrowthSek,
              popularity: playerRoundSnapshots.popularity,
            })
            .from(playerRoundSnapshots)
            .where(inArray(playerRoundSnapshots.roundId, priceRoundIds))
        : Promise.resolve<
            {
              playerId: string;
              roundId: string;
              priceSek: number;
              totalGrowthSek: number;
              popularity: number;
            }[]
          >([]),
      getRejectedTeamIds(),
      latestRoundId
        ? db.select().from(squads).where(eq(squads.roundId, latestRoundId))
        : Promise.resolve<(typeof squads.$inferSelect)[]>([]),
    ]);

  const clubById = new Map(allClubs.map((c) => [c.id, c]));

  const priceByPlayer = new Map<string, number>();
  const basePriceByPlayer = new Map<string, number>();
  const growthByPlayer = new Map<string, number>();
  const popByPlayer = new Map<string, number>();
  for (const s of allSnapshots) {
    if (s.roundId === baseRoundId) basePriceByPlayer.set(s.playerId, s.priceSek);
    if (s.roundId === latestRoundId) {
      priceByPlayer.set(s.playerId, s.priceSek);
      growthByPlayer.set(s.playerId, s.totalGrowthSek);
      popByPlayer.set(s.playerId, s.popularity);
    }
    if (!priceByPlayer.has(s.playerId)) priceByPlayer.set(s.playerId, s.priceSek);
  }

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

  const order = { GK: 0, DEF: 1, MID: 2, FWD: 3 } as const;
  const roster: ClubPlayer[] = allPlayers
    .filter((p: Player) => clubFor(p.externalId) === name)
    .map((p: Player) => {
      const club = p.clubId ? clubById.get(p.clubId) : null;
      return {
        id: p.id,
        externalId: p.externalId,
        name: p.name,
        position: p.position,
        countryCode: club?.countryCode ?? null,
        countryName: club?.name ?? null,
        priceSek: priceByPlayer.get(p.id) ?? null,
        basePriceSek: basePriceByPlayer.get(p.id) ?? null,
        growthSek: growthByPlayer.get(p.id) ?? null,
        abPopularityPct: (popByPlayer.get(p.id) ?? 0) * 100,
        ourOwnerCount: ownerCountByPlayer.get(p.id) ?? 0,
      };
    })
    .sort((a, b) => {
      if (order[a.position] !== order[b.position]) {
        return order[a.position] - order[b.position];
      }
      return (b.priceSek ?? 0) - (a.priceSek ?? 0);
    });

  // Club-level aggregates.
  const rosterIds = new Set(roster.map((p) => p.id));
  const teamsOwning = new Set<string>();
  for (const pid of rosterIds) {
    for (const tid of owningTeamsByPlayer.get(pid) ?? []) teamsOwning.add(tid);
  }
  const mostPicked = roster.reduce<ClubDetail["mostPicked"]>((best, p) => {
    if (p.ourOwnerCount <= 0) return best;
    if (!best || p.ourOwnerCount > best.count) {
      return { id: p.id, name: p.name, count: p.ourOwnerCount };
    }
    return best;
  }, null);

  return {
    name,
    slug,
    players: roster,
    latestRoundNumber: played.length > 0 ? (latestRound?.number ?? null) : null,
    squadValueSek: roster.reduce((acc, p) => acc + (p.priceSek ?? 0), 0),
    totalGrowthSek: roster.reduce((acc, p) => acc + (p.growthSek ?? 0), 0),
    ownedByTeamCount: teamsOwning.size,
    ourTeamTotal: ourSquads.length,
    mostPicked,
  };
}
