"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { squadDrafts, teams } from "@/db/schema";
import { getOrCreateDbUser } from "@/lib/auth";
import { evaluateSquad } from "@/lib/commit-squad";
import { getDraftableRound, resolveDraftPriceRoundId } from "@/lib/draft-data";

export type SaveDraftResult = {
  ok: boolean;
  errors: string[];
  /** Preview of the transfers the draft would make (at provisional prices). */
  transfers?: { count: number; totalFeeSek: number; freeUsed: number };
};

type ApprovedTeam =
  | { ok: true; team: typeof teams.$inferSelect }
  | { ok: false; error: string };

async function approvedTeam(): Promise<ApprovedTeam> {
  const user = await getOrCreateDbUser();
  if (!user) return { ok: false, error: "Inte inloggad." };
  if (user.status !== "approved") {
    return { ok: false, error: "Endast godkända lag kan förbereda transfers." };
  }
  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.ownerUserId, user.id))
    .limit(1);
  if (!team) return { ok: false, error: "Inget lag funnet." };
  return { ok: true, team };
}

/**
 * Save (upsert) a pre-transfer draft for the upcoming round. Validates legality
 * + budget against PROVISIONAL prices; the draft is re-checked for real when
 * the round opens (applyDraftsForRound). One draft per (team, round).
 */
export async function saveDraftAction(
  playerIds: string[],
  captainPlayerId: string | null,
): Promise<SaveDraftResult> {
  const res = await approvedTeam();
  if (!res.ok) return { ok: false, errors: [res.error] };
  const { team } = res;

  const round = await getDraftableRound();
  if (!round) {
    return {
      ok: false,
      errors: ["Det går inte att förbereda transfers just nu."],
    };
  }

  const priceRoundId = await resolveDraftPriceRoundId(round);
  const evald = await evaluateSquad({
    teamId: team.id,
    round: { id: round.id, number: round.number },
    playerIds,
    captainPlayerId,
    priceRoundId,
  });
  if (!evald.ok) return { ok: false, errors: evald.errors };

  const [existing] = await db
    .select({ id: squadDrafts.id })
    .from(squadDrafts)
    .where(
      and(eq(squadDrafts.teamId, team.id), eq(squadDrafts.roundId, round.id)),
    )
    .limit(1);

  if (existing) {
    await db
      .update(squadDrafts)
      .set({
        playerIds,
        captainPlayerId,
        status: "pending",
        rejectReason: null,
        appliedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(squadDrafts.id, existing.id));
  } else {
    await db.insert(squadDrafts).values({
      teamId: team.id,
      roundId: round.id,
      playerIds,
      captainPlayerId,
      status: "pending",
    });
  }

  revalidatePath("/app");
  revalidatePath("/app/squad");
  return {
    ok: true,
    errors: [],
    transfers: evald.transferDiff
      ? {
          count: evald.transferDiff.rows.length,
          totalFeeSek: evald.transferDiff.totalFeeSek,
          freeUsed: evald.transferDiff.freeUsed,
        }
      : undefined,
  };
}

/** Discard the team's pending draft for the upcoming round. */
export async function clearDraftAction(): Promise<{ ok: boolean }> {
  const res = await approvedTeam();
  if (!res.ok) return { ok: false };
  const { team } = res;
  const round = await getDraftableRound();
  if (!round) return { ok: false };
  await db
    .delete(squadDrafts)
    .where(
      and(eq(squadDrafts.teamId, team.id), eq(squadDrafts.roundId, round.id)),
    );
  revalidatePath("/app");
  revalidatePath("/app/squad");
  return { ok: true };
}
