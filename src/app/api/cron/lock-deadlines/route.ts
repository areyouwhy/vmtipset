import { NextResponse } from "next/server";
import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { rounds, squads } from "@/db/schema";

/**
 * Cron-callable: flips `lockedAt` on every squad belonging to a round
 * whose deadline has passed but which hasn't been scored yet. Idempotent.
 *
 * Vercel Crons send `Authorization: Bearer ${CRON_SECRET}`. Verify when the
 * env var is set; otherwise allow (e.g. local manual hits).
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401 },
      );
    }
  }

  const now = new Date();
  const allRounds = await db.select().from(rounds);
  const dueRounds = allRounds.filter(
    (r) =>
      r.status !== "scored" &&
      r.deadline !== null &&
      new Date(r.deadline) < now,
  );

  let lockedSquads = 0;
  for (const r of dueRounds) {
    const result = await db
      .update(squads)
      .set({ lockedAt: now })
      .where(and(eq(squads.roundId, r.id), isNull(squads.lockedAt)))
      .returning({ id: squads.id });
    lockedSquads += result.length;

    if (r.status === "open") {
      await db
        .update(rounds)
        .set({ status: "locked" })
        .where(and(eq(rounds.id, r.id), ne(rounds.status, "scored")));
    }
  }

  return NextResponse.json({
    ok: true,
    checkedRounds: dueRounds.length,
    lockedSquads,
    lockedAt: now.toISOString(),
  });
}
