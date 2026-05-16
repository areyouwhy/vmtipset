/**
 * One-off validation: pull a PAST Aftonbladet game's data and verify that
 * Σ (event × value) ≈ growth for every player/round pair. Doesn't touch the
 * DB — fetches via the source client and computes against the in-memory
 * fantasyEventTypes catalog. Run with:
 *
 *   AFTONBLADET_GAME_ID=700 npx tsx scripts/validate-events.ts
 *
 * Game 700 = "Aftonbladet - Premier Fantasy Fall 2024" (finished season,
 * so events are populated for every round).
 */
import { aftonbladetSource } from "../src/lib/sources/aftonbladet";

async function main() {
  const data = await aftonbladetSource.fetchAll();
  console.log(`Rounds: ${data.rounds.length}`);
  console.log(`Players: ${data.players.length}`);
  console.log(`Snapshots: ${data.snapshots.length}`);
  console.log(`Fantasy event types: ${data.fantasyEventTypes?.length ?? 0}`);

  const eventValueById = new Map<number, number>();
  for (const t of data.fantasyEventTypes ?? []) {
    eventValueById.set(t.id, t.valueSek);
  }

  let withEvents = 0;
  let exactMatch = 0;
  let mismatchCount = 0;
  const mismatchSamples: Array<{
    player: string;
    round: string;
    growth: number;
    computed: number;
    events: Array<{ typeId: number; amount: number }>;
  }> = [];

  for (const s of data.snapshots) {
    const events = s.events ?? [];
    if (events.length === 0) continue;
    withEvents++;
    let computed = 0;
    for (const e of events) {
      const v = eventValueById.get(e.typeId);
      if (v == null) continue;
      computed += v * e.amount;
    }
    if (computed === s.growthSek) {
      exactMatch++;
    } else {
      mismatchCount++;
      if (mismatchSamples.length < 5) {
        mismatchSamples.push({
          player: s.playerExternalId,
          round: s.roundExternalId,
          growth: s.growthSek,
          computed,
          events,
        });
      }
    }
  }

  console.log("\n=== Event sanity check ===");
  console.log(`Snapshots with events: ${withEvents}`);
  console.log(`Exact match (Σ events × value === growth): ${exactMatch}`);
  console.log(`Mismatches: ${mismatchCount}`);
  if (mismatchSamples.length > 0) {
    console.log("\nFirst mismatch samples:");
    for (const m of mismatchSamples) {
      console.log(
        ` ${m.player} ${m.round} growth=${m.growth} computed=${m.computed} diff=${m.growth - m.computed} events=${JSON.stringify(m.events)}`,
      );
    }
  }

  console.log("\n=== Top event types by frequency ===");
  const freq = new Map<number, number>();
  for (const s of data.snapshots) {
    for (const e of s.events ?? []) {
      freq.set(e.typeId, (freq.get(e.typeId) ?? 0) + e.amount);
    }
  }
  const byTypeName = new Map(
    (data.fantasyEventTypes ?? []).map((t) => [t.id, t]),
  );
  const sortedFreq = Array.from(freq.entries()).sort((a, b) => b[1] - a[1]);
  for (const [typeId, count] of sortedFreq.slice(0, 15)) {
    const t = byTypeName.get(typeId);
    console.log(
      ` ${typeId.toString().padStart(4)}: ${(t?.title ?? "?").padEnd(28)} × ${count} (${t?.valueSek ?? "?"} SEK each)`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
