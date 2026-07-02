/** DB/API side of "just nu" — see omgang-now.ts for the pure logic. */

import { asc } from "drizzle-orm";
import { db } from "@/db";
import { rounds } from "@/db/schema";
import { matchTally, pickCurrentRound, type OmgangNow } from "@/lib/omgang-now";
import { getAllMatches } from "@/lib/wc-tournament";

export async function getOmgangNow(): Promise<OmgangNow | null> {
  const [allRounds, allMatches] = await Promise.all([
    db
      .select({
        number: rounds.number,
        name: rounds.name,
        status: rounds.status,
        deadline: rounds.deadline,
      })
      .from(rounds)
      .orderBy(asc(rounds.number)),
    getAllMatches().catch(() => []),
  ]);

  const current = pickCurrentRound(allRounds);
  if (!current) return null;
  return { ...current, ...matchTally(allMatches, current.number) };
}
