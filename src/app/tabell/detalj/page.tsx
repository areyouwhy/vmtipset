import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { getLeaderboard } from "@/lib/leaderboard";
import { TabellClient } from "../table-client";

export const revalidate = 300;

export const metadata = {
  title: "TABELL · DETALJ — Copa del Mundo 2026",
  description:
    "Detaljerad tabell: totalpoäng, rondresultat och jämförelse av flera lag.",
};

export default async function TabellDetaljPage() {
  const lb = await getLeaderboard().catch(() => null);
  if (!lb) {
    return (
      <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
        <div className="mx-auto w-full max-w-3xl">
          <Breadcrumbs
            trail={[{ label: "TABELL", href: "/tabell" }, { label: "DETALJ" }]}
          />
          <p className="mt-8 border border-yellow/30 bg-yellow/5 p-4 text-sm text-dim">
            Underhåll pågår — försök igen om en stund.
          </p>
        </div>
      </main>
    );
  }
  const scoredRounds = lb.rounds.filter((r) => r.isScored);

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <Breadcrumbs
          trail={[{ label: "TABELL", href: "/tabell" }, { label: "DETALJ" }]}
        />

        <section className="py-6">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-yellow sm:text-3xl">
            DETALJERAD TABELL
          </h1>
          <p className="mt-2 text-sm text-dim">
            VÄRDE = SQUAD + BANK. Det är vad varje lag är värt nu — vinnaren är den
            med högst LAGVÄRDE när VM är slut. Bocka 2–3 lag för att jämföra sida
            vid sida. Lika värde delar placering, vinstpengar splittras vid
            utbetalning.{" "}
            <Link href="/tabell" className="text-magenta">
              ← TILLBAKA TILL HETSEN
            </Link>{" "}
            <Link href="/hur/audit" className="text-cyan">
              · SE AUDIT →
            </Link>
          </p>
          <p className="mt-1 text-xs text-dim">
            POÄNGSATTA RONDER:{" "}
            <span className="text-foreground tabular-nums">
              {scoredRounds.length}
            </span>{" "}
            / {lb.rounds.length}
          </p>
        </section>

        {lb.rows.length === 0 ? (
          <p className="border border-border p-4 text-sm text-dim">
            Inga lag ännu.
          </p>
        ) : (
          <>
            {scoredRounds.length === 0 && (
              <p className="mb-3 border border-yellow/30 bg-yellow/5 px-3 py-2 text-xs text-dim">
                Inga ronder är poängsatta ännu — ordningen visas efter lagvärde.
              </p>
            )}
            <TabellClient
              rows={lb.rows}
              rounds={lb.rounds}
              anyScored={lb.anyScored}
            />
          </>
        )}

        <p className="mt-8 text-center text-[10px] uppercase tracking-widest text-dim">
          ──── EOF ────
        </p>
      </div>
    </main>
  );
}
