import { asc } from "drizzle-orm";
import { db } from "@/db";
import { sideBets } from "@/db/schema";
import { Breadcrumbs } from "@/components/breadcrumbs";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "SIDOSPEL — Copa del Mundo 2026",
  description: "Sidospel utan poäng eller pengar — bara skoj.",
};

export default async function SideBetsPage() {
  const all = await db.select().from(sideBets).orderBy(asc(sideBets.createdAt));
  const open = all.filter((b) => !b.resolution);
  const resolved = all.filter((b) => b.resolution);

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <Breadcrumbs trail={[{ label: "SIDOSPEL" }]} />

        <section className="py-6">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-yellow">
            SIDOSPEL
          </h1>
          <p className="mt-2 text-sm text-dim">
            Frågor utan poäng eller pengar. Avgörs offline, resultatet skrivs in
            här när det är klart.
          </p>
        </section>

        <Section title={`ÖPPNA (${open.length})`} bets={open} />
        <Section title={`AVGJORDA (${resolved.length})`} bets={resolved} />

        <p className="mt-8 text-center text-[10px] uppercase tracking-widest text-dim">
          ──── EOF ────
        </p>
      </div>
    </main>
  );
}

function Section({
  title,
  bets,
}: {
  title: string;
  bets: typeof sideBets.$inferSelect[];
}) {
  return (
    <section className="mt-6">
      <h2 className="text-xs uppercase tracking-widest text-dim">{title}</h2>
      {bets.length === 0 ? (
        <p className="mt-2 border border-border p-3 text-sm text-dim">— tomt —</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {bets.map((b) => (
            <li key={b.id} className="border border-border p-4">
              <p className="text-foreground">{b.question}</p>
              {b.resolution && (
                <p className="mt-3 border-l-2 border-green pl-3 text-sm">
                  <span className="text-[10px] uppercase tracking-widest text-green">
                    RESULTAT
                  </span>
                  <br />
                  <span className="text-foreground">{b.resolution}</span>
                  {b.resolvedAt && (
                    <span className="ml-2 text-[10px] text-dim">
                      ·{" "}
                      {new Date(b.resolvedAt)
                        .toISOString()
                        .slice(0, 10)}
                    </span>
                  )}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
