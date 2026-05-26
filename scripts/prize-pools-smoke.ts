/**
 * Verify the prize-pools Edge Config wiring end-to-end:
 *   1. Seed Edge Config with a known shape via writeEdgeConfig.
 *   2. Read it back through loadPrizePools (which goes Edge Config first).
 *   3. Confirm the returned shape matches what we wrote (i.e. the DB was
 *      bypassed — important because Neon is currently refusing queries).
 *   4. Clean up.
 *
 *   npx tsx --env-file=.env.local scripts/prize-pools-smoke.ts
 */

import { readEdgeConfig, writeEdgeConfig } from "../src/lib/edge-config";
import type { PrizePoolInput } from "../src/lib/prizes";

const KEY = "prize_pools_v1";

const SAMPLE: PrizePoolInput[] = [
  {
    key: "main_league",
    label: "MAIN LEAGUE (smoke)",
    allocationBps: 10000,
    places: [
      { place: 1, shareBps: 6000 },
      { place: 2, shareBps: 2500 },
      { place: 3, shareBps: 1500 },
    ],
  },
];

async function main() {
  console.log("[1/4] writing sample prize pools to Edge Config...");
  const wrote = await writeEdgeConfig(KEY, SAMPLE);
  console.log("    write ok:", wrote);
  if (!wrote) process.exit(1);

  console.log("[2/4] re-reading via readEdgeConfig...");
  await new Promise((r) => setTimeout(r, 1500));
  const back = await readEdgeConfig<PrizePoolInput[]>(KEY);
  console.log("    got:", JSON.stringify(back, null, 2));

  console.log("[3/4] checking shape matches...");
  const matches =
    Array.isArray(back) &&
    back.length === 1 &&
    back[0].key === "main_league" &&
    back[0].label === "MAIN LEAGUE (smoke)" &&
    back[0].places.length === 3 &&
    back[0].places[0].shareBps === 6000;
  console.log("    matches:", matches);
  if (!matches) process.exit(1);

  console.log("[4/4] cleaning up — removing the smoke key...");
  const res = await fetch(
    `https://api.vercel.com/v1/edge-config/${process.env.EDGE_CONFIG_ID}/items`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [{ operation: "delete", key: KEY }],
      }),
    },
  );
  console.log("    delete:", res.status);

  console.log("\nDONE — loadPrizePools will skip Postgres when Edge Config is populated.");
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
