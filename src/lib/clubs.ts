import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { clubFor, PLAYER_CLUBS } from "@/data/player-clubs";
import { db } from "@/db";
import { clubs, players, playerRoundSnapshots, rounds, type Player } from "@/db/schema";

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
  priceSek: number | null;
};

export type ClubDetail = {
  name: string;
  slug: string;
  players: ClubPlayer[];
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

  // Rounds first so we can filter snapshots to (base, latest) only —
  // we never read middle-round prices on the club page.
  const allRounds = await db.select().from(rounds).orderBy(asc(rounds.number));
  const baseRoundId = allRounds[0]?.id;
  const latestRoundId = allRounds[allRounds.length - 1]?.id;
  const priceRoundIds = [
    ...new Set([baseRoundId, latestRoundId].filter((x): x is string => !!x)),
  ];

  const [allPlayers, allClubs, allSnapshots] = await Promise.all([
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
          })
          .from(playerRoundSnapshots)
          .where(inArray(playerRoundSnapshots.roundId, priceRoundIds))
      : Promise.resolve<{ playerId: string; roundId: string; priceSek: number }[]>([]),
  ]);

  const clubById = new Map(allClubs.map((c) => [c.id, c]));

  const priceByPlayer = new Map<string, number>();
  // Manual wins over API is already enforced by ingest — latest round
  // wins over base round here.
  for (const s of allSnapshots) {
    const prev = priceByPlayer.get(s.playerId);
    if (prev == null) {
      priceByPlayer.set(s.playerId, s.priceSek);
    } else if (s.roundId === latestRoundId) {
      priceByPlayer.set(s.playerId, s.priceSek);
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
      };
    })
    .sort((a, b) => {
      if (order[a.position] !== order[b.position]) {
        return order[a.position] - order[b.position];
      }
      return (b.priceSek ?? 0) - (a.priceSek ?? 0);
    });

  return { name, slug, players: roster };
}
