/**
 * Seed Edge Config with the current DEFAULT_POOLS so loadPrizePools
 * can serve prod requests without touching Postgres until an admin
 * customises the config.
 *
 *   npx tsx --env-file=.env.local scripts/seed-prize-pools.ts
 */

import { writeEdgeConfig, readEdgeConfig } from "../src/lib/edge-config";
import { DEFAULT_POOLS } from "../src/lib/prize-config";
import type { PrizePoolInput } from "../src/lib/prizes";

async function main() {
  console.log("seeding prize_pools_v1 with DEFAULT_POOLS:");
  console.log(JSON.stringify(DEFAULT_POOLS, null, 2));

  const ok = await writeEdgeConfig("prize_pools_v1", DEFAULT_POOLS);
  if (!ok) {
    console.error("write failed");
    process.exit(1);
  }

  await new Promise((r) => setTimeout(r, 1500));
  const back = await readEdgeConfig<PrizePoolInput[]>("prize_pools_v1");
  console.log("\nverified from Edge Config:");
  console.log(JSON.stringify(back, null, 2));
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
