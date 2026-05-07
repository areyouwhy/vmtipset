import Link from "next/link";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { rounds } from "@/db/schema";
import { isAdmin } from "@/lib/auth";
import { getAllBetsWithMeta, getBetAnswersForBet } from "@/lib/bets-data";
import { CreateBetForm } from "./create-bet-form";
import { BetCard } from "./bet-card";

export const dynamic = "force-dynamic";

export default async function AdminBetsPage() {
  if (!(await isAdmin())) redirect("/app");

  const [allBets, allRounds] = await Promise.all([
    getAllBetsWithMeta(),
    db.select().from(rounds).orderBy(asc(rounds.number)),
  ]);

  // Pre-load answers per bet for inline rendering (small dataset; fine).
  const answersByBet = new Map<string, Awaited<ReturnType<typeof getBetAnswersForBet>>>();
  for (const b of allBets) {
    answersByBet.set(b.bet.id, await getBetAnswersForBet(b.bet.id));
  }

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <header className="flex items-center justify-between border-b border-border pb-3 text-xs uppercase tracking-widest">
          <span className="text-yellow">COPA / ADMIN / BET</span>
          <Link href="/admin" className="text-cyan">
            ← ADMIN
          </Link>
        </header>

        <section className="py-6">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-yellow">
            DAGENS BET
          </h1>
          <p className="mt-2 text-sm text-dim">
            Skapa frågor, deltagarna svarar, du sätter rätt svar och systemet
            delar ut poäng. Egen tabell, egen pott (20% av total enligt
            standardkonfig).
          </p>
        </section>

        <section className="border border-border p-5">
          <p className="text-[10px] uppercase tracking-widest text-dim">
            NY BET
          </p>
          <h2 className="mt-1 text-lg font-bold uppercase tracking-tight text-yellow">
            SKAPA FRÅGA
          </h2>
          <CreateBetForm
            rounds={allRounds.map((r) => ({
              id: r.id,
              number: r.number,
              name: r.name,
            }))}
          />
        </section>

        <section className="mt-8">
          <h2 className="text-xs uppercase tracking-widest text-dim">
            ALLA BET ({allBets.length})
          </h2>
          {allBets.length === 0 ? (
            <p className="mt-3 border border-border p-4 text-sm text-dim">
              Inga bet ännu.
            </p>
          ) : (
            <ul className="mt-3 space-y-4">
              {allBets.map((b) => (
                <li key={b.bet.id}>
                  <BetCard
                    meta={b}
                    answers={answersByBet.get(b.bet.id) ?? []}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
