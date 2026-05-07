"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { squadPlayers, squads, teams } from "@/db/schema";
import { getOrCreateDbUser } from "@/lib/auth";
import { validateSquad, type SquadCandidate } from "@/lib/squad";
import {
  getActiveRound,
  getCurrentSquad,
  getPickablePlayers,
} from "@/lib/squad-data";

export type SaveSquadResult = { ok: boolean; errors: string[] };

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

  const existing = await getCurrentSquad(team.id, round.id);
  if (existing?.lockedAt) {
    return { ok: false, errors: ["Truppen är låst för denna rond."] };
  }

  const pickable = await getPickablePlayers(round.id);
  const byId = new Map(pickable.map((p) => [p.id, p]));
  const players = playerIds.flatMap((id) => {
    const p = byId.get(id);
    return p
      ? [
          {
            id: p.id,
            position: p.position,
            clubExternalId: p.clubExternalId,
            countryCode: p.countryCode,
            priceSek: p.priceSek,
          },
        ]
      : [];
  });
  if (players.length !== playerIds.length) {
    return { ok: false, errors: ["Okänd spelare i truppen."] };
  }

  const candidate: SquadCandidate = { players, captainPlayerId };
  const errors = validateSquad(candidate);
  if (errors.length > 0) return { ok: false, errors };

  // Persist. No transactions over Neon HTTP — sequence carefully.
  let squadId: string;
  if (existing) {
    await db
      .update(squads)
      .set({ captainPlayerId, updatedAt: new Date() })
      .where(eq(squads.id, existing.squadId));
    squadId = existing.squadId;
    await db
      .delete(squadPlayers)
      .where(eq(squadPlayers.squadId, squadId));
  } else {
    const [created] = await db
      .insert(squads)
      .values({
        teamId: team.id,
        roundId: round.id,
        captainPlayerId,
      })
      .returning();
    squadId = created.id;
  }

  await db
    .insert(squadPlayers)
    .values(playerIds.map((pid) => ({ squadId, playerId: pid })));

  revalidatePath("/app");
  revalidatePath("/app/squad");
  return { ok: true, errors: [] };
}
