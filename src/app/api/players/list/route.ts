import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clubs, players } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * Lightweight player list for client-side pickers (admin bet correct-answer
 * + user bet answer submit). Returns id / name / position / countryCode.
 *
 * Public — same data is visible everywhere already.
 */
export async function GET() {
  const [allPlayers, allClubs] = await Promise.all([
    db.select().from(players).where(eq(players.active, true)).orderBy(asc(players.name)),
    db.select().from(clubs),
  ]);
  const clubById = new Map(allClubs.map((c) => [c.id, c]));
  return NextResponse.json(
    allPlayers.map((p) => {
      const club = p.clubId ? clubById.get(p.clubId) : null;
      return {
        id: p.id,
        name: p.name,
        position: p.position,
        countryCode: club?.countryCode ?? null,
        clubShortName: club?.shortName ?? null,
      };
    }),
  );
}
