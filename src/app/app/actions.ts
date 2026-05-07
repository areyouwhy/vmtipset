"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { db } from "@/db";
import { teams } from "@/db/schema";
import { getOrCreateDbUser } from "@/lib/auth";

const teamNameSchema = z
  .string()
  .trim()
  .min(2, "Lagnamnet måste vara minst 2 tecken")
  .max(40, "Lagnamnet får vara max 40 tecken");

export async function createTeamAction(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const { userId } = await auth();
  if (!userId) return { error: "Du måste vara inloggad" };

  const parsed = teamNameSchema.safeParse(formData.get("name"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ogiltigt lagnamn" };
  }

  await getOrCreateDbUser();

  try {
    await db.insert(teams).values({
      ownerUserId: userId,
      name: parsed.data,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("teams_name_unique") || msg.includes("duplicate key")) {
      return { error: "Ett lag med det namnet finns redan" };
    }
    if (msg.includes("teams_owner_user_id_unique")) {
      return { error: "Du har redan ett lag" };
    }
    throw err;
  }

  revalidatePath("/app");
  return {};
}
