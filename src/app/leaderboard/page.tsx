import Link from "next/link";
import { getLeaderboard } from "@/lib/leaderboard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "TABELL — Copa del Mundo 2026",
  description: "Tabell över alla lag, totalpoäng och rondresultat.",
};

export default async function LeaderboardPage() {
  const lb = await getLeaderboard();
  const scoredRounds = lb.rounds.filter((r) => r.isScored);

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <header className="flex items-center justify-between border-b border-border pb-3 text-xs uppercase tracking-widest">
          <span className="text-yellow">COPA / TABELL</span>
          <Link href="/" className="text-cyan">
            ← HEM
          </Link>
        </header>

        <section className="py-6">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-yellow sm:text-3xl">
            LIGATABELL
          </h1>
          <p className="mt-2 text-sm text-dim">
            Total = summa av rondpoäng. Vid lika delas placeringen, vinst-
            pengar splittras vid utbetalning.{" "}
            <Link href="/how/audit" className="text-cyan">
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
        ) : scoredRounds.length === 0 ? (
          <p className="border border-yellow/30 bg-yellow/5 p-4 text-sm text-dim">
            Inga ronder är poängsatta ännu — tabellen är tom.
          </p>
        ) : (
          <ul className="space-y-3">
            {lb.rows.map((row) => (
              <li
                key={row.teamId}
                className="border border-border p-4"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex items-baseline gap-3 min-w-0">
                    <span className="tabular-nums text-yellow text-lg font-bold">
                      {String(row.rank).padStart(2, "0")}
                    </span>
                    <RankArrow change={row.rankChange} />
                    <Link
                      href={`/team/${row.teamId}`}
                      className="truncate font-bold uppercase tracking-tight text-foreground hover:text-cyan"
                    >
                      {row.teamName}
                    </Link>
                  </div>
                  <span className="tabular-nums text-yellow">
                    {fmtSek(row.totalPointsSek)}
                  </span>
                </div>
                <p className="mt-1 truncate text-[10px] uppercase tracking-widest text-dim">
                  {row.ownerHandle}
                </p>

                {scoredRounds.length > 0 && (
                  <ul className="mt-3 -mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 text-[11px] tabular-nums">
                    {row.perRound.map((pr) => (
                      <li
                        key={pr.roundId}
                        className="shrink-0 snap-start border border-border px-2 py-1"
                      >
                        <span className="text-dim">
                          R{pr.roundNumber}{" "}
                        </span>
                        <span
                          className={
                            pr.pointsSek === null
                              ? "text-dim"
                              : pr.pointsSek > 0
                                ? "text-green"
                                : pr.pointsSek < 0
                                  ? "text-red"
                                  : "text-foreground"
                          }
                        >
                          {pr.pointsSek === null ? "—" : fmtSek(pr.pointsSek)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-8 text-center text-[10px] uppercase tracking-widest text-dim">
          ──── EOF ────
        </p>
      </div>
    </main>
  );
}

function RankArrow({ change }: { change: number | null }) {
  if (change === null) {
    return <span className="text-[10px] text-dim">·</span>;
  }
  if (change === 0) {
    return <span className="text-[10px] text-dim">—</span>;
  }
  if (change > 0) {
    return (
      <span className="text-[10px] tabular-nums text-green">
        ↑{change}
      </span>
    );
  }
  return (
    <span className="text-[10px] tabular-nums text-red">
      ↓{Math.abs(change)}
    </span>
  );
}

function fmtSek(n: number): string {
  if (n === 0) return "0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k`;
  return `${sign}${abs}`;
}
