import { NextResponse } from "next/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { clubs, players } from "@/db/schema";

const getActivePlayersList = unstable_cache(
  async () => {
    const [allPlayers, allClubs] = await Promise.all([
      db
        .select()
        .from(players)
        .where(and(eq(players.active, true), isNull(players.archivedAt)))
        .orderBy(asc(players.name)),
      db.select().from(clubs),
    ]);
    const clubById = new Map(allClubs.map((c) => [c.id, c]));
    return allPlayers.map((p) => {
      const club = p.clubId ? clubById.get(p.clubId) : null;
      return {
        id: p.id,
        name: p.name,
        position: p.position,
        countryCode: club?.countryCode ?? null,
        clubShortName: club?.shortName ?? null,
      };
    });
  },
  ["players-list-lite"],
  { tags: ["players"], revalidate: 3600 },
);

/**
 * Lightweight player list for client-side pickers (admin bet correct-answer
 * + user bet answer submit). Returns id / name / position / countryCode.
 *
 * Public — same data is visible everywhere already.
 */
export async function GET() {
  try {
    const data = await getActivePlayersList();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
