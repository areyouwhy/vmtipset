import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { rounds, squadDrafts, teams } from "@/db/schema";
import { commitSquad } from "@/lib/commit-squad";

export type DraftApplyReport = {
  roundNumber: number;
  appliedCount: number;
  rejectedCount: number;
  applied: { teamName: string }[];
  rejected: { teamName: string; reason: string }[];
};

/**
 * Apply every PENDING pre-transfer draft for a round, against the prices in
 * force right now. Re-validates + commits each via the shared commitSquad
 * engine — an applied draft is identical to the owner having saved it during
 * the open window. A draft that no longer fits (price moved, player archived,
 * …) is left unapplied: the carried-forward squad stays, and the draft is
 * marked `rejected` with a reason.
 *
 * Each team is isolated in its own try/catch so one bad draft can never break
 * the round opening or another team's apply. Idempotent: only `pending` drafts
 * are touched, so re-running is safe.
 */
export async function applyDraftsForRound(
  roundId: string,
): Promise<DraftApplyReport> {
  const [round] = await db
    .select()
    .from(rounds)
    .where(eq(rounds.id, roundId))
    .limit(1);
  if (!round) {
    return {
      roundNumber: 0,
      appliedCount: 0,
      rejectedCount: 0,
      applied: [],
      rejected: [],
    };
  }

  const drafts = await db
    .select()
    .from(squadDrafts)
    .where(eq(squadDrafts.roundId, roundId));
  const pending = drafts.filter((d) => d.status === "pending");

  const teamIds = [...new Set(pending.map((d) => d.teamId))];
  const teamRows =
    teamIds.length > 0
      ? await db.select().from(teams).where(inArray(teams.id, teamIds))
      : [];
  const teamName = new Map(teamRows.map((t) => [t.id, t.name]));

  const applied: { teamName: string }[] = [];
  const rejected: { teamName: string; reason: string }[] = [];

  for (const draft of pending) {
    const name = teamName.get(draft.teamId) ?? "—";
    try {
      const result = await commitSquad({
        teamId: draft.teamId,
        round: { id: round.id, number: round.number },
        playerIds: draft.playerIds,
        captainPlayerId: draft.captainPlayerId,
      });
      if (result.ok) {
        await db
          .update(squadDrafts)
          .set({ status: "applied", appliedAt: new Date(), rejectReason: null })
          .where(eq(squadDrafts.id, draft.id));
        applied.push({ teamName: name });
      } else {
        const reason = result.errors.join("; ") || "Kunde inte genomföras.";
        await db
          .update(squadDrafts)
          .set({ status: "rejected", rejectReason: reason })
          .where(eq(squadDrafts.id, draft.id));
        rejected.push({ teamName: name, reason });
      }
    } catch (err) {
      const reason =
        err instanceof Error ? `Tekniskt fel: ${err.message}` : "Tekniskt fel.";
      await db
        .update(squadDrafts)
        .set({ status: "rejected", rejectReason: reason })
        .where(eq(squadDrafts.id, draft.id));
      rejected.push({ teamName: name, reason });
    }
  }

  return {
    roundNumber: round.number,
    appliedCount: applied.length,
    rejectedCount: rejected.length,
    applied,
    rejected,
  };
}
