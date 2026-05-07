import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { rounds, squads, teamRoundScores } from "@/db/schema";
import { isAdmin } from "@/lib/auth";
import { RoundRow } from "./round-row";

export const dynamic = "force-dynamic";

export default async function AdminRoundsPage() {
  if (!(await isAdmin())) redirect("/app");

  const allRounds = await db.select().from(rounds).orderBy(asc(rounds.number));

  // Per-round counts
  const enriched = await Promise.all(
    allRounds.map(async (r) => {
      const [squadCount] = await db
        .select({ n: count() })
        .from(squads)
        .where(eq(squads.roundId, r.id));
      const [scoreCount] = await db
        .select({ n: count() })
        .from(teamRoundScores)
        .where(eq(teamRoundScores.roundId, r.id));
      return {
        ...r,
        squadCount: squadCount.n,
        scoreCount: scoreCount.n,
      };
    }),
  );

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <header className="flex items-center justify-between border-b border-border pb-3 text-xs uppercase tracking-widest">
          <span className="text-yellow">COPA / ADMIN / RONDER</span>
          <Link href="/admin" className="text-cyan">
            ← ADMIN
          </Link>
        </header>

        <section className="py-6">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-yellow">
            ROND-LIVSCYKEL
          </h1>
          <p className="mt-2 text-sm text-dim">
            Öppna en rond så att deltagare kan välja trupp. Lås när deadline
            passerar. Poängsätt när alla matcher är spelade — det går att köra
            om så länge data ändras.
          </p>
        </section>

        <ul className="space-y-4">
          {enriched.length === 0 && (
            <li className="border border-border p-4 text-sm text-dim">
              Inga ronder. Kör mock-ingest från{" "}
              <Link href="/admin/data" className="text-cyan">
                /admin/data
              </Link>
              .
            </li>
          )}
          {enriched.map((r) => (
            <RoundRow
              key={r.id}
              roundId={r.id}
              number={r.number}
              name={r.name}
              status={r.status}
              deadline={r.deadline}
              squadCount={r.squadCount}
              scoreCount={r.scoreCount}
            />
          ))}
        </ul>
      </div>
    </main>
  );
}
