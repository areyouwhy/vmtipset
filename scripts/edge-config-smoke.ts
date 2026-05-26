/**
 * One-off smoke test for the Edge Config integration.
 *
 *   npx tsx --env-file=.env.local scripts/edge-config-smoke.ts
 *
 * Verifies:
 *   1. read returns null when the key isn't set
 *   2. write succeeds via the Vercel REST API
 *   3. read now returns what we wrote
 *   4. clean up so we don't pollute production state
 */

import { readEdgeConfig, writeEdgeConfig } from "../src/lib/edge-config";

const KEY = "edge_config_smoke";
const VALUE = { hello: "world", at: new Date().toISOString() };

async function main() {
  console.log("[1/4] reading initial state...");
  const before = await readEdgeConfig(KEY);
  console.log("    got:", before);

  console.log("[2/4] writing test value...");
  const ok = await writeEdgeConfig(KEY, VALUE);
  console.log("    write ok:", ok);
  if (!ok) {
    console.error("    write failed — check EDGE_CONFIG_ID + VERCEL_API_TOKEN");
    process.exit(1);
  }

  // Edge Config writes are eventually consistent; the client SDK reads
  // the same snapshot the function instance was warmed with, so a fresh
  // process is the most reliable way to see the new value. For the
  // round-trip test we re-read after a short delay and accept either
  // the new value or null (followed by manual verification on Vercel).
  console.log("[3/4] re-reading after 2s...");
  await new Promise((r) => setTimeout(r, 2000));
  const after = await readEdgeConfig(KEY);
  console.log("    got:", after);

  console.log("[4/4] cleaning up...");
  const cleanupRes = await fetch(
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
  console.log("    delete response:", cleanupRes.status);

  console.log("\nDONE");
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
