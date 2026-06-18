import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  playerRoundSnapshots,
  rounds,
  squadDrafts,
  type Round,
  type SquadDraft,
} from "@/db/schema";

/**
 * Pre-transfer ("förhandsval") read layer. Isolated from the live game — only
 * the squad_drafts table + read-only round/snapshot lookups.
 */

/**
 * The round a user can currently prepare a pre-transfer for, or null.
 *
 * Available only in the gap between rounds: when NO round is `open` (during an
 * open round people use the normal picker) and the next `upcoming` round exists
 * — that round already has carried-forward squads, so there's something to
 * transfer from.
 */
export async function getDraftableRound(): Promise<Round | null> {
  const all = await db.select().from(rounds).orderBy(asc(rounds.number));
  if (all.some((r) => r.status === "open")) return null;
  return all.find((r) => r.status === "upcoming") ?? null;
}

/**
 * Which round's prices to validate a draft against: the target round's own
 * snapshot once the ingest has written it, otherwise the previous round's
 * prices as a provisional estimate (re-checked for real at apply time).
 */
export async function resolveDraftPriceRoundId(round: {
  id: string;
  number: number;
}): Promise<string> {
  const [snap] = await db
    .select({ id: playerRoundSnapshots.id })
    .from(playerRoundSnapshots)
    .where(eq(playerRoundSnapshots.roundId, round.id))
    .limit(1);
  if (snap) return round.id;

  const [prev] = await db
    .select()
    .from(rounds)
    .where(eq(rounds.number, round.number - 1))
    .limit(1);
  return prev?.id ?? round.id;
}

export async function getMyDraft(
  teamId: string,
  roundId: string,
): Promise<SquadDraft | null> {
  const [row] = await db
    .select()
    .from(squadDrafts)
    .where(and(eq(squadDrafts.teamId, teamId), eq(squadDrafts.roundId, roundId)))
    .limit(1);
  return row ?? null;
}
