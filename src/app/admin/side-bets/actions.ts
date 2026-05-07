"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { sideBets } from "@/db/schema";
import { isAdmin } from "@/lib/auth";

async function requireAdmin() {
  if (!(await isAdmin())) throw new Error("Forbidden");
}

export type ActionResult = { ok: boolean; errors: string[] };

const createSchema = z.object({
  question: z.string().trim().min(3).max(500),
});

export async function createSideBetAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = createSchema.safeParse({ question: formData.get("question") });
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  }
  await db.insert(sideBets).values({ question: parsed.data.question });
  revalidatePath("/admin/side-bets");
  revalidatePath("/side-bets");
  revalidatePath("/app");
  return { ok: true, errors: [] };
}

export async function setResolutionAction(
  id: string,
  resolution: string | null,
): Promise<ActionResult> {
  await requireAdmin();
  const trimmed = resolution?.trim();
  await db
    .update(sideBets)
    .set({
      resolution: trimmed && trimmed.length > 0 ? trimmed : null,
      resolvedAt: trimmed && trimmed.length > 0 ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(sideBets.id, id));
  revalidatePath("/admin/side-bets");
  revalidatePath("/side-bets");
  revalidatePath("/app");
  return { ok: true, errors: [] };
}

export async function deleteSideBetAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  await db.delete(sideBets).where(eq(sideBets.id, id));
  revalidatePath("/admin/side-bets");
  revalidatePath("/side-bets");
  revalidatePath("/app");
  return { ok: true, errors: [] };
}
