"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  clubs,
  playerRoundSnapshots,
  players,
  rounds,
  squadPlayers,
  squads,
  transfers,
} from "@/db/schema";
import { isAdmin } from "@/lib/auth";
import { runIngest, type IngestSummary } from "@/lib/ingest-apply";
import { mockSource } from "@/lib/sources/mock";

export async function runMockIngestAction(): Promise<IngestSummary> {
  if (!(await isAdmin())) throw new Error("Forbidden");
  const summary = await runIngest(mockSource);
  revalidatePath("/admin/data");
  return summary;
}

/**
 * Wipes all player-related data (snapshots, players, clubs, rounds) AND any
 * downstream squads/transfers that depend on them. Dev/testing tool — never
 * call once we have real users with real squads they care about.
 */
export async function wipeAndReingestAction(): Promise<IngestSummary> {
  if (!(await isAdmin())) throw new Error("Forbidden");

  // Delete in dependency order. Cascade FKs handle most of it but be explicit.
  await db.delete(transfers);
  await db.delete(squadPlayers);
  await db.delete(squads);
  await db.delete(playerRoundSnapshots);
  await db.delete(players);
  await db.delete(rounds);
  await db.delete(clubs);

  const summary = await runIngest(mockSource);
  revalidatePath("/admin/data");
  revalidatePath("/app");
  revalidatePath("/app/squad");
  return summary;
}
