"use server";

import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { reactions } from "@/db/schema";
import { FADES_EMOJIS } from "@/lib/reactions-emojis";

export type ToggleReactionResult = {
  ok: boolean;
  error?: "not-signed-in" | "bad-input";
  /** true if the reaction is now ON, false if it was toggled OFF. */
  active?: boolean;
};

/**
 * Toggle a single emoji reaction for the signed-in user on a target. One row
 * per (target, emoji, user): clicking again removes it. Validates the emoji +
 * target namespace so only intended reactions are written.
 */
export async function toggleReaction(
  targetKey: string,
  emoji: string,
): Promise<ToggleReactionResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "not-signed-in" };
  if (
    !targetKey.startsWith("fades:") ||
    !(FADES_EMOJIS as readonly string[]).includes(emoji)
  ) {
    return { ok: false, error: "bad-input" };
  }

  const deleted = await db
    .delete(reactions)
    .where(
      and(
        eq(reactions.targetKey, targetKey),
        eq(reactions.emoji, emoji),
        eq(reactions.userId, userId),
      ),
    )
    .returning({ id: reactions.id });

  let active: boolean;
  if (deleted.length === 0) {
    await db.insert(reactions).values({ targetKey, emoji, userId });
    active = true;
  } else {
    active = false;
  }

  revalidatePath("/hets/fades");
  return { ok: true, active };
}
