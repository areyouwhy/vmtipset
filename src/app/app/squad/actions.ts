"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import {
  rounds,
  squadPlayers,
  squads,
  teams,
  transfers,
} from "@/db/schema";
import { getOrCreateDbUser } from "@/lib/auth";
import { currentRules } from "@/lib/rules";
import { validateSquad, type SquadCandidate } from "@/lib/squad";
import {
  getActiveRound,
  getCurrentSquad,
  getPickablePlayers,
} from "@/lib/squad-data";
import { computeTransfers } from "@/lib/transfers";

export type SaveSquadResult = {
  ok: boolean;
  errors: string[];
  transfers?: { count: number; totalFeeSek: number; freeUsed: number };
};

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

  // Determine the prior reference squad for transfer calculation.
  // If we already saved this round before, the diff is vs. the saved squad
  // (so re-edits don't double-count fees). Otherwise, vs. the previous round.
  const referencePlayerIds = await loadReferencePlayerIds(team.id, round.number);

  // Compute transfer diff if this isn't the very first squad ever.
  const transferDiff =
    referencePlayerIds === null
      ? null
      : computeTransfers({
          previousPlayerIds: referencePlayerIds,
          newPlayerIds: playerIds,
          priceByPlayerId: new Map(pickable.map((p) => [p.id, p.priceSek])),
          transferFeePct: currentRules.transferFeePct,
          freeTransfersPerRound: currentRules.freeTransfersPerRound,
        });

  // Persist. No transactions over Neon HTTP — sequence carefully.
  let squadId: string;
  if (existing) {
    // Picker only lets the user pick from non-archived players, and
    // validateSquad has already verified every ID is in the pickable set,
    // so a successful save proves the squad no longer contains archived
    // players — clear any invalid flag set by an earlier ingest run.
    await db
      .update(squads)
      .set({
        captainPlayerId,
        invalid: false,
        invalidReason: null,
        updatedAt: new Date(),
      })
      .where(eq(squads.id, existing.squadId));
    squadId = existing.squadId;
    await db.delete(squadPlayers).where(eq(squadPlayers.squadId, squadId));
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

  // Replace transfer rows for this round with the freshly computed diff.
  await db
    .delete(transfers)
    .where(
      and(eq(transfers.teamId, team.id), eq(transfers.roundId, round.id)),
    );
  if (transferDiff && transferDiff.rows.length > 0) {
    await db.insert(transfers).values(
      transferDiff.rows.map((r) => ({
        teamId: team.id,
        roundId: round.id,
        playerInId: r.playerInId,
        playerOutId: r.playerOutId,
        sellPriceSek: r.sellPriceSek,
        buyPriceSek: r.buyPriceSek,
        feeSek: r.feeSek,
      })),
    );
  }

  revalidatePath("/app");
  revalidatePath("/app/squad");
  return {
    ok: true,
    errors: [],
    transfers: transferDiff
      ? {
          count: transferDiff.rows.length,
          totalFeeSek: transferDiff.totalFeeSek,
          freeUsed: transferDiff.freeUsed,
        }
      : undefined,
  };
}

/**
 * For transfer diffing: pick the squad that the new save is "transferring
 * from". Round 1 has no transfers — return null. Otherwise return the most
 * recent earlier round's squad players.
 */
async function loadReferencePlayerIds(
  teamId: string,
  currentRoundNumber: number,
): Promise<string[] | null> {
  if (currentRoundNumber <= 1) return null;

  const earlier = await db
    .select()
    .from(rounds)
    .where(lt(rounds.number, currentRoundNumber))
    .orderBy(asc(rounds.number));
  if (earlier.length === 0) return null;

  const prevRound = earlier.at(-1);
  if (!prevRound) return null;

  const prevSquad = await getCurrentSquad(teamId, prevRound.id);
  if (!prevSquad) return null;
  return prevSquad.playerIds;
}
