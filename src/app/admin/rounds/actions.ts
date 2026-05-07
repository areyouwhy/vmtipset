"use server";

import { revalidatePath } from "next/cache";
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

export async function openRoundAction(roundId: string): Promise<void> {
  await requireAdmin();
  await setRoundStatus(roundId, "open");
  revalidatePath("/admin/rounds");
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
