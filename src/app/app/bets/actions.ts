"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { betAnswers, bets, teams } from "@/db/schema";
import { getOrCreateDbUser } from "@/lib/auth";

export type SubmitAnswerResult = { ok: boolean; error?: string };

export async function submitBetAnswerAction(args: {
  betId: string;
  answerPlayerId: string | null;
  answerNumeric: number | null;
}): Promise<SubmitAnswerResult> {
  const user = await getOrCreateDbUser();
  if (!user) return { ok: false, error: "Inte inloggad." };
  if (user.status !== "approved") {
    return { ok: false, error: "Endast godkända lag kan svara." };
  }
  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.ownerUserId, user.id))
    .limit(1);
  if (!team) return { ok: false, error: "Inget lag." };

  const [bet] = await db
    .select()
    .from(bets)
    .where(eq(bets.id, args.betId))
    .limit(1);
  if (!bet) return { ok: false, error: "Bet hittades inte." };
  if (bet.status !== "open") {
    return { ok: false, error: "Beten är stängd." };
  }
  if (bet.deadline && new Date(bet.deadline) < new Date()) {
    return { ok: false, error: "Deadline passerad." };
  }

  if (bet.answerType === "player_ref" && !args.answerPlayerId) {
    return { ok: false, error: "Spelare krävs." };
  }
  if (bet.answerType === "numeric" && args.answerNumeric === null) {
    return { ok: false, error: "Siffra krävs." };
  }

  // Upsert: existing answer for this (bet, team) gets overwritten.
  const [existing] = await db
    .select()
    .from(betAnswers)
    .where(
      and(
        eq(betAnswers.betId, args.betId),
        eq(betAnswers.teamId, team.id),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(betAnswers)
      .set({
        answerPlayerId: args.answerPlayerId,
        answerNumeric: args.answerNumeric,
        updatedAt: new Date(),
      })
      .where(eq(betAnswers.id, existing.id));
  } else {
    await db.insert(betAnswers).values({
      betId: args.betId,
      teamId: team.id,
      answerPlayerId: args.answerPlayerId,
      answerNumeric: args.answerNumeric,
    });
  }

  revalidatePath("/app");
  revalidatePath("/admin/bets");
  return { ok: true };
}
