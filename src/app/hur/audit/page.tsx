import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { rounds } from "@/db/schema";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { getRoundAudit } from "@/lib/leaderboard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "AUDIT — Copa del Mundo 2026",
  description:
    "Per-round audit: every snapshot id used for scoring is listed so anyone can hand-recompute.",
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ round?: string }>;
}) {
  const sp = await searchParams;
  const allRounds = await db.select().from(rounds).orderBy(asc(rounds.number));
  const scored = allRounds.filter((r) => r.status === "scored");
  const selected =
    scored.find((r) => r.id === sp.round) ?? scored.at(-1) ?? null;
  const audit = selected ? await getRoundAudit(selected.id) : null;

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <Breadcrumbs
          trail={[
            { label: "HUR", href: "/hur" },
            { label: "AUDIT" },
          ]}
        />

        <section className="py-6">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-yellow sm:text-3xl">
            AUDIT
          </h1>
          <p className="mt-2 text-sm text-dim">
            Allt du behöver för att räkna om en rond för hand. Varje rad pekar
            på den exakta snapshot-raden som matades in i scoring-funktionen.
            Om något inte stämmer — visa siffrorna här.
          </p>
        </section>

        {scored.length === 0 ? (
          <p className="border border-yellow/30 bg-yellow/5 p-4 text-sm text-dim">
            Inga ronder är poängsatta ännu. Audit-trail dyker upp när admin har
            stängt en rond.
          </p>
        ) : (
          <>
            <nav className="mb-6 flex flex-wrap gap-2 border border-border p-2">
              {scored.map((r) => {
                const active = r.id === selected?.id;
                return (
                  <Link
                    key={r.id}
                    href={`/hur/audit?round=${r.id}`}
                    className={`border px-3 py-1.5 text-[10px] uppercase tracking-widest transition tabular-nums ${
                      active
                        ? "border-yellow bg-yellow text-black"
                        : "border-border text-dim hover:border-cyan hover:text-cyan"
                    }`}
                  >
                    R{r.number} {r.name}
                  </Link>
                );
              })}
            </nav>

            {audit && audit.teams.length === 0 && (
              <p className="border border-border p-4 text-sm text-dim">
                Inga lag scorade i denna rond.
              </p>
            )}

            {audit?.teams.map((team) => (
              <section
                key={team.teamId}
                className="mb-6 border border-border p-4"
              >
                <header className="flex items-baseline justify-between gap-3 text-xs uppercase tracking-widest">
                  <span>
                    <span className="text-yellow">{team.teamName}</span>{" "}
                    <span className="text-dim">· {team.ownerHandle}</span>
                  </span>
                  <span className="tabular-nums text-yellow">
                    {fmtSek(team.total.totalPointsSek)}
                  </span>
                </header>

                <dl className="mt-2 grid grid-cols-2 gap-2 text-[10px] uppercase tracking-widest tabular-nums text-dim sm:grid-cols-6">
                  <KV k="TILLVÄXT" v={fmtSek(team.total.sumGrowthSek)} />
                  <KV k="© BONUS" v={fmtSek(team.total.captainBonusSek)} />
                  <KV k="RÄNTA" v={fmtSek(team.total.bankInterestSek)} />
                  <KV k="AVGIFT" v={fmtSek(-team.total.transferFeesSek)} />
                  <KV
                    k="TRANSFER"
                    v={fmtSek(team.total.transferCashFlowSek)}
                  />
                  <KV k="BANK SLUT" v={fmtSek(team.total.bankSekEnd)} />
                </dl>

                <table className="mt-4 w-full text-[11px] tabular-nums">
                  <thead>
                    <tr className="border-b border-border text-[10px] uppercase tracking-widest text-dim">
                      <th className="py-1 text-left">POS</th>
                      <th className="py-1 text-left">SPELARE</th>
                      <th className="py-1 text-right">PRIS</th>
                      <th className="py-1 text-right">TILLVÄXT</th>
                      <th className="py-1 text-left">SNAPSHOT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.perPlayer.map((pl) => (
                      <tr
                        key={pl.playerId}
                        className="border-b border-dotted border-border/60"
                      >
                        <td className="py-1 text-yellow">{pl.position}</td>
                        <td className="py-1 text-foreground">
                          {pl.isCaptain && (
                            <span className="text-yellow">© </span>
                          )}
                          {pl.playerName}{" "}
                          <span className="text-dim">
                            {pl.countryCode ?? "—"}
                          </span>
                        </td>
                        <td className="py-1 text-right text-foreground">
                          {(pl.priceSek / 1_000_000).toFixed(1)}M
                        </td>
                        <td
                          className={`py-1 text-right ${
                            pl.growthSek > 0
                              ? "text-green"
                              : pl.growthSek < 0
                                ? "text-red"
                                : "text-dim"
                          }`}
                        >
                          {fmtSek(pl.growthSek)}
                        </td>
                        <td className="py-1 text-[9px] text-dim">
                          {pl.snapshotId.slice(0, 8)}…
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </>
        )}

        <p className="mt-8 text-center text-[10px] uppercase tracking-widest text-dim">
          ──── EOF ────
        </p>
      </div>
    </main>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-widest text-dim">{k}</dt>
      <dd className="mt-0.5 text-foreground">{v}</dd>
    </div>
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
