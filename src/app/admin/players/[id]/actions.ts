"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { playerRoundSnapshots } from "@/db/schema";
import { isAdmin } from "@/lib/auth";

async function requireAdmin() {
  if (!(await isAdmin())) throw new Error("Forbidden");
}

export type ActionResult = { ok: boolean; errors: string[] };

export async function upsertManualSnapshotAction(args: {
  playerId: string;
  roundId: string;
  priceSek: number;
  growthSek: number;
  notes?: string | null;
}): Promise<ActionResult> {
  await requireAdmin();
  if (!Number.isFinite(args.priceSek) || args.priceSek < 0) {
    return { ok: false, errors: ["Pris måste vara ≥ 0."] };
  }
  if (!Number.isFinite(args.growthSek)) {
    return { ok: false, errors: ["Tillväxt måste vara ett tal."] };
  }
  const [existing] = await db
    .select()
    .from(playerRoundSnapshots)
    .where(
      and(
        eq(playerRoundSnapshots.playerId, args.playerId),
        eq(playerRoundSnapshots.roundId, args.roundId),
        eq(playerRoundSnapshots.source, "manual"),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(playerRoundSnapshots)
      .set({
        priceSek: Math.trunc(args.priceSek),
        growthSek: Math.trunc(args.growthSek),
        notes: args.notes ?? null,
      })
      .where(eq(playerRoundSnapshots.id, existing.id));
  } else {
    await db.insert(playerRoundSnapshots).values({
      playerId: args.playerId,
      roundId: args.roundId,
      priceSek: Math.trunc(args.priceSek),
      growthSek: Math.trunc(args.growthSek),
      source: "manual",
      notes: args.notes ?? null,
    });
  }

  revalidatePath(`/admin/players/${args.playerId}`);
  revalidatePath("/admin/players");
  return { ok: true, errors: [] };
}

export async function deleteManualSnapshotAction(args: {
  playerId: string;
  roundId: string;
}): Promise<ActionResult> {
  await requireAdmin();
  await db
    .delete(playerRoundSnapshots)
    .where(
      and(
        eq(playerRoundSnapshots.playerId, args.playerId),
        eq(playerRoundSnapshots.roundId, args.roundId),
        eq(playerRoundSnapshots.source, "manual"),
      ),
    );
  revalidatePath(`/admin/players/${args.playerId}`);
  revalidatePath("/admin/players");
  return { ok: true, errors: [] };
}
