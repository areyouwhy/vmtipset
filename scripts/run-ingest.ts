/**
 * One-off: run the configured Aftonbladet ingest against the prod DB.
 * Loads env from .env.local. Run with:
 *
 *   npx tsx --env-file=.env.local scripts/run-ingest.ts
 */
import { runIngest } from "../src/lib/ingest-apply";
import { aftonbladetSource } from "../src/lib/sources/aftonbladet";

async function main() {
  const r = await runIngest(aftonbladetSource);
  console.log("ingest summary:", r);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
