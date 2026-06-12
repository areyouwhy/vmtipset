import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { rivalryVotes } from "@/db/schema";

/**
 * Read layer for /hets rivalry voting. Deliberately uncached — counts must be
 * fresh right after a vote. The vote table is isolated from the game graph.
 */

export type VoteSummary = {
  /** votes per side_key. */
  bySide: Record<string, number>;
  total: number;
};

export async function getVoteSummary(rivalrySlug: string): Promise<VoteSummary> {
  const rows = await db
    .select({
      sideKey: rivalryVotes.sideKey,
      n: sql<number>`count(*)::int`,
    })
    .from(rivalryVotes)
    .where(eq(rivalryVotes.rivalrySlug, rivalrySlug))
    .groupBy(rivalryVotes.sideKey);

  const bySide: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    bySide[r.sideKey] = r.n;
    total += r.n;
  }
  return { bySide, total };
}

/** The given user's current pick for a rivalry, or null if they haven't voted. */
export async function getMyVote(
  rivalrySlug: string,
  userId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ sideKey: rivalryVotes.sideKey })
    .from(rivalryVotes)
    .where(
      and(
        eq(rivalryVotes.rivalrySlug, rivalrySlug),
        eq(rivalryVotes.userId, userId),
      ),
    )
    .limit(1);
  return row?.sideKey ?? null;
}
