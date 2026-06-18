import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { reactions } from "@/db/schema";

/**
 * Emoji-reaction read layer (isolated `reactions` table). Uncached — counts
 * must be fresh right after a toggle. `targetKey` namespaces what's reacted to
 * (e.g. "fades:kajler-spara").
 *
 * The emoji palette lives in `reactions-emojis.ts` (db-free) so client
 * components can import it without pulling in `@/db`.
 */

export { FADES_EMOJIS, type FadesEmoji } from "./reactions-emojis";

/** targetKey → emoji → count. */
export async function getReactionCounts(
  targetKeys: string[],
): Promise<Record<string, Record<string, number>>> {
  const out: Record<string, Record<string, number>> = {};
  if (targetKeys.length === 0) return out;
  const rows = await db
    .select({
      targetKey: reactions.targetKey,
      emoji: reactions.emoji,
      n: sql<number>`count(*)::int`,
    })
    .from(reactions)
    .where(inArray(reactions.targetKey, targetKeys))
    .groupBy(reactions.targetKey, reactions.emoji);
  for (const r of rows) {
    (out[r.targetKey] ??= {})[r.emoji] = r.n;
  }
  return out;
}

/** targetKey → emojis this user has reacted with. */
export async function getMyReactions(
  targetKeys: string[],
  userId: string,
): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  if (targetKeys.length === 0) return out;
  const rows = await db
    .select({ targetKey: reactions.targetKey, emoji: reactions.emoji })
    .from(reactions)
    .where(
      and(
        inArray(reactions.targetKey, targetKeys),
        eq(reactions.userId, userId),
      ),
    );
  for (const r of rows) {
    (out[r.targetKey] ??= []).push(r.emoji);
  }
  return out;
}
