import { eq } from "drizzle-orm";
import { db } from "@/db";
import { teams, users } from "@/db/schema";

/**
 * Team IDs whose owner has been rejected. Rejected owners aren't in the league,
 * so their squads/transfers must be excluded from every public stat surface.
 * (The main leaderboard already filters this inline; this is the shared filter
 * for round stats, transfers, exposure, player ownership and the overview.)
 */
export async function getRejectedTeamIds(): Promise<Set<string>> {
  const rows = await db
    .select({ id: teams.id })
    .from(teams)
    .innerJoin(users, eq(users.id, teams.ownerUserId))
    .where(eq(users.status, "rejected"));
  return new Set(rows.map((r) => r.id));
}
