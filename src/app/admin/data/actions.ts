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
  teamRoundScores,
  transfers,
} from "@/db/schema";
import { isAdmin } from "@/lib/auth";
import { runIngest, type IngestSummary } from "@/lib/ingest-apply";
import { aftonbladetSource } from "@/lib/sources/aftonbladet";
import { mockSource } from "@/lib/sources/mock";
import type { DataSource } from "@/lib/sources/types";

async function requireAdmin() {
  if (!(await isAdmin())) throw new Error("Forbidden");
}

const SOURCES: Record<"mock" | "aftonbladet", DataSource> = {
  mock: mockSource,
  aftonbladet: aftonbladetSource,
};

export async function runIngestAction(
  source: "mock" | "aftonbladet",
): Promise<IngestSummary> {
  await requireAdmin();
  const summary = await runIngest(SOURCES[source]);
  revalidatePath("/admin/data");
  return summary;
}

/**
 * Wipes all player-related data (snapshots, players, clubs, rounds) AND any
 * downstream squads/transfers/scores that depend on them. Dev/testing tool —
 * never call once we have real users with real squads they care about.
 */
export async function wipeAndReingestAction(
  source: "mock" | "aftonbladet" = "mock",
): Promise<IngestSummary> {
  await requireAdmin();

  // Delete in dependency order. Cascade FKs handle most of it but be explicit.
  await db.delete(transfers);
  await db.delete(squadPlayers);
  await db.delete(squads);
  await db.delete(teamRoundScores);
  await db.delete(playerRoundSnapshots);
  await db.delete(players);
  await db.delete(rounds);
  await db.delete(clubs);

  const summary = await runIngest(SOURCES[source]);
  revalidatePath("/admin/data");
  revalidatePath("/app");
  revalidatePath("/app/squad");
  return summary;
}
