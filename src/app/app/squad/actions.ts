"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { teams } from "@/db/schema";
import { getOrCreateDbUser } from "@/lib/auth";
import { commitSquad, type CommitSquadResult } from "@/lib/commit-squad";
import { getActiveRound, getCurrentSquad } from "@/lib/squad-data";

export type SaveSquadResult = CommitSquadResult;

export async function saveSquadAction(
  playerIds: string[],
  captainPlayerId: string | null,
): Promise<SaveSquadResult> {
  const user = await getOrCreateDbUser();
  if (!user) return { ok: false, errors: ["Inte inloggad."] };
  if (user.status !== "approved") {
    return {
      ok: false,
      errors: ["Endast godkända lag kan spara trupp."],
    };
  }

  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.ownerUserId, user.id))
    .limit(1);
  if (!team) return { ok: false, errors: ["Inget lag funnet."] };

  const round = await getActiveRound();
  if (!round) {
    return { ok: false, errors: ["Ingen aktiv rond — admin har inte öppnat någon."] };
  }

  // Reveal-state gate: the leaderboard exposes every team's lineup once a
  // round is `locked`/`scored`. Edits must be blocked in exactly those states
  // so nobody can peek at others' squads and then re-pick. (`lockedAt` alone
  // isn't enough — a manual admin lock flips status without stamping it.)
  if (round.status === "locked" || round.status === "scored") {
    return { ok: false, errors: [`${round.name} är låst för redigering.`] };
  }

  const existing = await getCurrentSquad(team.id, round.id);
  if (existing?.lockedAt) {
    return { ok: false, errors: ["Truppen är låst för denna rond."] };
  }
  // No deadline enforcement: a round is editable for exactly as long as the
  // admin keeps it `open`. Deadlines are display-only; closing the round
  // (status → locked) is what stops trading and reveals lineups.

  const result = await commitSquad({
    teamId: team.id,
    round: { id: round.id, number: round.number },
    playerIds,
    captainPlayerId,
  });

  if (result.ok) {
    revalidatePath("/app");
    revalidatePath("/app/squad");
  }
  return result;
}
