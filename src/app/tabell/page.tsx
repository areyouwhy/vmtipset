import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { getLeaderboard } from "@/lib/leaderboard";
import { teamSlug } from "@/lib/team-slug";
import { TabellClient } from "./table-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "TABELL — Copa del Mundo 2026",
  description: "Tabell över alla lag, totalpoäng och rondresultat.",
};

export default async function TabellPage() {
  const lb = await getLeaderboard();
  const scoredRounds = lb.rounds.filter((r) => r.isScored);

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <Breadcrumbs trail={[{ label: "TABELL" }]} />

        <section className="py-6">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-yellow sm:text-3xl">
            LIGATABELL
          </h1>
          <p className="mt-2 text-sm text-dim">
            Total = summa av rondpoäng. Bocka 2–3 lag för att jämföra dem
            sida vid sida. Lika poäng delar placering, vinstpengar splittras
            vid utbetalning.{" "}
            <Link href="/hur/audit" className="text-cyan">
              SE AUDIT →
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

        <section className="mt-10">
          <h2 className="text-xs uppercase tracking-widest text-yellow">
            DAGENS BET — POOL
          </h2>
          <p className="mt-1 text-xs text-dim">
            Egen pott (20% av totalpotten enligt standardkonfig). Endast lag
            som vunnit poäng visas.
          </p>
          {lb.dailyBets.length === 0 ? (
            <p className="mt-3 border border-border p-3 text-sm text-dim">
              Inga poängsatta bet ännu.
            </p>
          ) : (
            <table className="mt-3 w-full border border-border text-sm tabular-nums">
              <tbody className="divide-y divide-border">
                {lb.dailyBets.map((row) => (
                  <tr key={row.teamId}>
                    <td className="px-2 py-1.5 text-right text-yellow w-10">
                      {String(row.rank).padStart(2, "0")}
                    </td>
                    <td className="px-2 py-1.5">
                      <Link
                        href={`/team/${teamSlug(row.teamName)}`}
                        className="block truncate text-foreground hover:text-cyan"
                      >
                        {row.teamName}
                      </Link>
                      <span className="block text-[10px] uppercase tracking-widest text-dim">
                        {row.ownerHandle}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right text-yellow">
                      {row.pointsTotal}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <p className="mt-8 text-center text-[10px] uppercase tracking-widest text-dim">
          ──── EOF ────
        </p>
      </div>
    </main>
  );
}
