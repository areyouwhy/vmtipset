"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { betAnswers, bets, type BetAnswerType } from "@/db/schema";
import { isAdmin } from "@/lib/auth";
import { scoreBet, type BetForScoring } from "@/lib/bets";

async function requireAdmin() {
  if (!(await isAdmin())) throw new Error("Forbidden");
}

const createSchema = z.object({
  question: z.string().trim().min(3).max(200),
  answerType: z.enum(["player_ref", "numeric"]),
  pointsValue: z.coerce.number().int().min(1).max(10000),
  deadline: z.string().optional(),
  roundId: z.string().optional(),
});

export type ActionResult = { ok: boolean; errors: string[] };

export async function createBetAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = createSchema.safeParse({
    question: formData.get("question"),
    answerType: formData.get("answerType"),
    pointsValue: formData.get("pointsValue"),
    deadline: formData.get("deadline") || undefined,
    roundId: formData.get("roundId") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  }
  await db.insert(bets).values({
    question: parsed.data.question,
    answerType: parsed.data.answerType as BetAnswerType,
    pointsValue: parsed.data.pointsValue,
    deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : null,
    roundId:
      parsed.data.roundId && parsed.data.roundId.length > 0
        ? parsed.data.roundId
        : null,
  });
  revalidatePath("/admin/bets");
  revalidatePath("/app");
  return { ok: true, errors: [] };
}

export async function deleteBetAction(betId: string): Promise<ActionResult> {
  await requireAdmin();
  await db.delete(bets).where(eq(bets.id, betId));
  revalidatePath("/admin/bets");
  revalidatePath("/app");
  return { ok: true, errors: [] };
}

export async function setBetStatusAction(
  betId: string,
  status: "open" | "closed",
): Promise<ActionResult> {
  await requireAdmin();
  await db
    .update(bets)
    .set({ status, updatedAt: new Date() })
    .where(eq(bets.id, betId));
  revalidatePath("/admin/bets");
  revalidatePath("/app");
  return { ok: true, errors: [] };
}

export async function setCorrectAnswerAndScoreAction(
  betId: string,
  correctAnswerPlayerId: string | null,
  correctAnswerNumeric: number | null,
): Promise<ActionResult> {
  await requireAdmin();
  const [bet] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);
  if (!bet) return { ok: false, errors: ["Bet hittades inte."] };

  if (bet.answerType === "player_ref" && !correctAnswerPlayerId) {
    return { ok: false, errors: ["Spelar-ID krävs för player_ref."] };
  }
  if (bet.answerType === "numeric" && correctAnswerNumeric === null) {
    return { ok: false, errors: ["Numeriskt svar krävs."] };
  }

  await db
    .update(bets)
    .set({
      correctAnswerPlayerId,
      correctAnswerNumeric,
      status: "scored",
      updatedAt: new Date(),
    })
    .where(eq(bets.id, betId));

  // Re-score answers
  const updatedBet: BetForScoring = {
    id: bet.id,
    answerType: bet.answerType,
    pointsValue: bet.pointsValue,
    correctAnswerPlayerId,
    correctAnswerNumeric,
  };
  const answers = await db
    .select()
    .from(betAnswers)
    .where(eq(betAnswers.betId, betId));
  const lines = scoreBet(
    updatedBet,
    answers.map((a) => ({
      id: a.id,
      teamId: a.teamId,
      answerPlayerId: a.answerPlayerId,
      answerNumeric: a.answerNumeric,
    })),
  );
  for (const l of lines) {
    await db
      .update(betAnswers)
      .set({ pointsAwarded: l.pointsAwarded, updatedAt: new Date() })
      .where(eq(betAnswers.id, l.answerId));
  }

  revalidatePath("/admin/bets");
  revalidatePath("/app");
  return { ok: true, errors: [] };
}

export async function reopenBetAction(betId: string): Promise<ActionResult> {
  await requireAdmin();
  await db
    .update(bets)
    .set({
      status: "open",
      correctAnswerPlayerId: null,
      correctAnswerNumeric: null,
      updatedAt: new Date(),
    })
    .where(eq(bets.id, betId));
  // Reset all answer points
  const answers = await db
    .select()
    .from(betAnswers)
    .where(eq(betAnswers.betId, betId));
  for (const a of answers) {
    await db
      .update(betAnswers)
      .set({ pointsAwarded: 0, updatedAt: new Date() })
      .where(eq(betAnswers.id, a.id));
  }
  revalidatePath("/admin/bets");
  revalidatePath("/app");
  return { ok: true, errors: [] };
}
