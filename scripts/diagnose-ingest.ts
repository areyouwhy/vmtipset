/**
 * Read-only diagnostic for the Aftonbladet ingest.
 *
 * Run with:
 *   npx tsx --env-file=.env.local scripts/diagnose-ingest.ts
 *
 * No DB writes. Compares live Aftonbladet `/players?limit=1000` (after the
 * source's active/eliminated filter) against current DB state, and surfaces
 * snapshot freshness per round.
 */

import { inArray, sql } from "drizzle-orm";
import { db } from "../src/db";
import {
  players as playersTbl,
  rounds as roundsTbl,
  playerRoundSnapshots,
  squadPlayers,
} from "../src/db/schema";
import { aftonbladetSource } from "../src/lib/sources/aftonbladet";
import { loadExistingState } from "../src/lib/ingest-apply";
import { planIngest } from "../src/lib/ingest";

function fmt(n: number): string {
  return String(n).padStart(4, " ");
}

async function main() {
  console.log("=== DB STATE ===\n");

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(playersTbl);
  const [{ inactive }] = await db
    .select({ inactive: sql<number>`count(*)::int` })
    .from(playersTbl)
    .where(sql`active = false`);
  console.log(`players total       : ${fmt(total)}`);
  console.log(`players inactive    : ${fmt(inactive)}\n`);

  // Snapshot freshness per round.
  const freshness = await db
    .select({
      roundNumber: roundsTbl.number,
      roundName: roundsTbl.name,
      snapshotCount: sql<number>`count(${playerRoundSnapshots.id})::int`,
      lastCapturedAt: sql<Date | null>`max(${playerRoundSnapshots.capturedAt})`,
    })
    .from(roundsTbl)
    .leftJoin(
      playerRoundSnapshots,
      sql`${playerRoundSnapshots.roundId} = ${roundsTbl.id}`,
    )
    .groupBy(roundsTbl.id, roundsTbl.number, roundsTbl.name)
    .orderBy(roundsTbl.number);

  console.log("snapshot freshness:");
  console.log("  round  count   last captured at");
  for (const r of freshness) {
    const ts = r.lastCapturedAt
      ? new Date(r.lastCapturedAt).toISOString()
      : "(none)";
    console.log(`  ${fmt(r.roundNumber)}  ${fmt(r.snapshotCount)}   ${ts}  ${r.roundName}`);
  }

  // Most recent player.updatedAt — proxy for "did the ingest run".
  const recent = await db
    .select({ updatedAt: sql<Date>`max(${playersTbl.updatedAt})` })
    .from(playersTbl);
  console.log(
    `\nplayers.updated_at MAX : ${recent[0].updatedAt ? new Date(recent[0].updatedAt).toISOString() : "(none)"}`,
  );

  console.log("\n=== LIVE AFTONBLADET SNAPSHOT ===\n");
  const incoming = await aftonbladetSource.fetchAll();
  console.log(`incoming clubs    : ${incoming.clubs.length}`);
  console.log(`incoming players  : ${incoming.players.length}  (after active/!eliminated filter)`);
  console.log(`incoming rounds   : ${incoming.rounds.length}`);
  console.log(`incoming snapshots: ${incoming.snapshots.length}`);

  console.log("\n=== PLANNER DIFF (what next cron run would do) ===\n");
  const existing = await loadExistingState();
  const plan = planIngest(incoming, existing);
  console.log(`clubs   inserts/updates: ${plan.clubs.filter(o => o.kind === "insert-club").length} / ${plan.clubs.filter(o => o.kind === "update-club").length}`);
  console.log(`players inserts/updates: ${plan.players.filter(o => o.kind === "insert-player").length} / ${plan.players.filter(o => o.kind === "update-player").length}`);
  console.log(`rounds  inserts/updates: ${plan.rounds.filter(o => o.kind === "insert-round").length} / ${plan.rounds.filter(o => o.kind === "update-round").length}`);
  console.log(`snaps   inserts/updates: ${plan.snapshots.filter(o => o.kind === "insert-snapshot").length} / ${plan.snapshots.filter(o => o.kind === "update-snapshot").length}`);
  console.log(`ORPHANED PLAYERS       : ${plan.orphanedPlayers.length}`);

  if (plan.orphanedPlayers.length > 0) {
    // For each orphan: name, club, currently in any squad?
    const orphanRows = await db
      .select({
        externalId: playersTbl.externalId,
        name: playersTbl.name,
        active: playersTbl.active,
        squadHits: sql<number>`(select count(*)::int from ${squadPlayers} where ${squadPlayers.playerId} = ${playersTbl.id})`,
      })
      .from(playersTbl)
      .where(inArray(playersTbl.externalId, plan.orphanedPlayers));

    const inSquads = orphanRows.filter((r) => r.squadHits > 0);
    const notInSquads = orphanRows.filter((r) => r.squadHits === 0);
    console.log(`  ↳ in user squads      : ${inSquads.length}`);
    console.log(`  ↳ not in any squad    : ${notInSquads.length}`);

    if (inSquads.length > 0) {
      console.log("\nORPHANS CURRENTLY IN USER SQUADS (these break teams):");
      for (const r of inSquads.slice(0, 50)) {
        console.log(
          `  ${(r.externalId ?? "—").padEnd(10)} ${r.active ? "[ACTIVE]" : "[inactive]"} ${r.name}  (in ${r.squadHits} squad row(s))`,
        );
      }
      if (inSquads.length > 50) console.log(`  ... and ${inSquads.length - 50} more`);
    }

    if (notInSquads.length > 0) {
      console.log("\nORPHANS NOT IN ANY SQUAD (safe to hard-delete):");
      const sample = notInSquads.slice(0, 20);
      for (const r of sample) {
        console.log(`  ${(r.externalId ?? "—").padEnd(10)} ${r.active ? "[ACTIVE]" : "[inactive]"} ${r.name}`);
      }
      if (notInSquads.length > 20) console.log(`  ... and ${notInSquads.length - 20} more`);
    }
  }

  // How many of OUR squad_players rows reference inactive players right now?
  const brokenSquadPlayers = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(squadPlayers)
    .innerJoin(playersTbl, sql`${playersTbl.id} = ${squadPlayers.playerId}`)
    .where(sql`${playersTbl.active} = false`);
  console.log(
    `\nsquad_players rows currently pointing at inactive players: ${brokenSquadPlayers[0].n}`,
  );

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
