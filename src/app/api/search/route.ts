import { and, asc, eq, ne } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { clubs, players, rounds, teams, users } from "@/db/schema";
import { PLAYER_CLUBS } from "@/data/player-clubs";
import { clubSlug } from "@/lib/clubs";
import { teamSlug } from "@/lib/team-slug";

/**
 * Search-palette catalog. One trip pulls everything the ⌘K palette needs
 * (players, national teams, domestic clubs, rounds) so client-side filtering
 * is instant. Static page entries are NOT here — they're in
 * `lib/search-pages.ts` and merged client-side with auth gating.
 */
export type SearchCatalog = {
  nations: { code: string; name: string }[];
  clubs: { slug: string; name: string }[];
  rounds: { number: number; name: string }[];
  teams: {
    slug: string;
    name: string;
    owner: string;
    status: "pending" | "approved";
  }[];
  players: {
    id: string;
    name: string;
    position: "GK" | "DEF" | "MID" | "FWD";
    country: string | null;
    club: string | null;
  }[];
};

/**
 * Build the catalog with narrow column projections (only what the palette
 * actually renders). Wrapped in unstable_cache so admin user approval +
 * ingest invalidate via revalidateTag("users" | "teams" | "players" | …).
 */
const buildSearchCatalog = unstable_cache(
  async (): Promise<SearchCatalog> => {
    const [allPlayers, allClubs, allRounds, allTeams] = await Promise.all([
      db
        .select({
          id: players.id,
          externalId: players.externalId,
          name: players.name,
          position: players.position,
          clubId: players.clubId,
        })
        .from(players)
        .where(eq(players.active, true))
        .orderBy(asc(players.name)),
      db
        .select({
          id: clubs.id,
          name: clubs.name,
          countryCode: clubs.countryCode,
        })
        .from(clubs)
        .orderBy(asc(clubs.name)),
      db
        .select({ number: rounds.number, name: rounds.name })
        .from(rounds)
        .orderBy(asc(rounds.number)),
      // Teams whose owner isn't rejected. pending teams are searchable —
      // they exist, they just haven't paid yet.
      db
        .select({
          name: teams.name,
          ownerStatus: users.status,
          ownerDisplayName: users.displayName,
          ownerEmail: users.email,
        })
        .from(teams)
        .innerJoin(users, eq(users.id, teams.ownerUserId))
        .where(and(ne(users.status, "rejected")))
        .orderBy(asc(teams.name)),
    ]);

    const clubById = new Map(allClubs.map((c) => [c.id, c]));

    // Nations from the clubs table — in WC context every "club" is a national team.
    const nations = allClubs.flatMap((c) =>
      c.countryCode ? [{ code: c.countryCode, name: c.name }] : [],
    );

    // Domestic clubs come from the manual lookup table. Dedupe by name +
    // attach a slug so the result links straight to /klubblag/[slug].
    const seenClubs = new Set<string>();
    const domesticClubs: { slug: string; name: string }[] = [];
    for (const name of Object.values(PLAYER_CLUBS)) {
      if (seenClubs.has(name)) continue;
      seenClubs.add(name);
      domesticClubs.push({ slug: clubSlug(name), name });
    }
    domesticClubs.sort((a, b) => a.name.localeCompare(b.name, "sv"));

    const playersOut = allPlayers.map((p) => {
      const club = p.clubId ? clubById.get(p.clubId) : null;
      return {
        id: p.id,
        name: p.name,
        position: p.position,
        country: club?.countryCode ?? null,
        club: p.externalId ? (PLAYER_CLUBS[p.externalId] ?? null) : null,
      };
    });

    const teamsOut = allTeams.map((t) => ({
      slug: teamSlug(t.name),
      name: t.name,
      owner: t.ownerDisplayName || t.ownerEmail.split("@")[0] || "okänd",
      status: t.ownerStatus as "pending" | "approved",
    }));

    return {
      nations,
      clubs: domesticClubs,
      rounds: allRounds,
      teams: teamsOut,
      players: playersOut,
    };
  },
  ["search-catalog"],
  {
    tags: ["users", "teams", "players", "rounds", "clubs"],
    revalidate: 3600,
  },
);

export async function GET(): Promise<NextResponse<SearchCatalog>> {
  try {
    const catalog = await buildSearchCatalog();
    return NextResponse.json(catalog, {
      headers: {
        // CDN holds the response for an hour; the underlying unstable_cache
        // gets tag-invalidated on admin approve / ingest, so this is safe.
        "cache-control":
          "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    // Degrade rather than 500 — palette just shows static page entries.
    return NextResponse.json(
      {
        nations: [],
        clubs: [],
        rounds: [],
        teams: [],
        players: [],
      },
      { status: 200 },
    );
  }
}
