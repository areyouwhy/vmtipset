"use server";

import { revalidatePath } from "next/cache";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { rounds } from "@/db/schema";
import { applyDraftsForRound, type DraftApplyReport } from "@/lib/apply-drafts";
import { isAdmin } from "@/lib/auth";
import {
  reopenRound,
  scoreRound,
  setRoundStatus,
  type ScoringSummary,
} from "@/lib/score-runner";

async function requireAdmin() {
  if (!(await isAdmin())) throw new Error("Forbidden");
}

/**
 * Open a round for trading, then apply everyone's pre-transfer drafts against
 * the now-current prices (commit the ones that still fit, reject the rest).
 * Returns the apply report so the admin sees exactly what happened.
 */
export async function openRoundAction(
  roundId: string,
): Promise<DraftApplyReport> {
  await requireAdmin();
  await setRoundStatus(roundId, "open");
  const report = await applyDraftsForRound(roundId);
  revalidatePath("/admin/rounds");
  revalidatePath("/app");
  revalidatePath("/tabell");
  return report;
}

export async function lockRoundAction(roundId: string): Promise<void> {
  await requireAdmin();
  await setRoundStatus(roundId, "locked");
  revalidatePath("/admin/rounds");
}

export async function scoreRoundAction(
  roundId: string,
): Promise<ScoringSummary> {
  await requireAdmin();
  const summary = await scoreRound(roundId);
  revalidatePath("/admin/rounds");
  revalidatePath("/app");
  return summary;
}

export async function reopenRoundAction(roundId: string): Promise<void> {
  await requireAdmin();
  await reopenRound(roundId);
  revalidatePath("/admin/rounds");
}

/**
 * Convenience for jumping into a season already in progress (PL test data,
 * mid-WC catch-up). Walks every round whose deadline has passed and scores it
 * sequentially — for rounds with no squads yet this is essentially a status
 * flip with empty results, which is exactly what we want.
 */
export async function scoreAllPastRoundsAction(): Promise<{
  scoredRoundCount: number;
  totalTeamsScored: number;
}> {
  await requireAdmin();
  const now = Date.now();
  const all = await db.select().from(rounds).orderBy(asc(rounds.number));
  const past = all.filter(
    (r) =>
      r.status !== "scored" &&
      r.deadline !== null &&
      new Date(r.deadline).getTime() <= now,
  );

  let totalTeamsScored = 0;
  for (const r of past) {
    const summary = await scoreRound(r.id);
    totalTeamsScored += summary.teamsScored;
  }

  revalidatePath("/admin/rounds");
  revalidatePath("/tabell");
  revalidatePath("/app");
  return { scoredRoundCount: past.length, totalTeamsScored };
}
