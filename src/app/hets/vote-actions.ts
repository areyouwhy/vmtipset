"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { rivalryVotes } from "@/db/schema";
import { getRivalry } from "@/lib/rivalries";

export type CastVoteResult = { ok: boolean; error?: string };

/**
 * Cast or change a rivalry vote. One row per (rivalry, Clerk user) — re-voting
 * upserts. Validates the rivalry + side against config so only real options can
 * be written. Read-only everywhere else; this is the single writer.
 */
export async function castVote(
  rivalrySlug: string,
  sideKey: string,
): Promise<CastVoteResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "not-signed-in" };

  const rivalry = getRivalry(rivalrySlug);
  if (!rivalry) return { ok: false, error: "unknown-rivalry" };
  if (!rivalry.sides.some((s) => s.key === sideKey)) {
    return { ok: false, error: "unknown-side" };
  }

  await db
    .insert(rivalryVotes)
    .values({ rivalrySlug, userId, sideKey })
    .onConflictDoUpdate({
      target: [rivalryVotes.rivalrySlug, rivalryVotes.userId],
      set: { sideKey, updatedAt: new Date() },
    });

  revalidatePath(`/hets/${rivalrySlug}`);
  return { ok: true };
}
