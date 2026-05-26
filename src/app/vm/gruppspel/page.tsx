import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { WcMatchLine } from "@/components/wc-match-line";
import { Jersey } from "@/lib/jersey";
import { getAllNations } from "@/lib/nation-data";
import {
  getGroupsView,
  type GroupView,
} from "@/lib/wc-tournament";
import { fifaRank, FIFA_RANK_SOURCE_DATE } from "@/data/fifa-rank";

export const revalidate = 600;

export default async function LandslagIndexPage() {
  const [nations, groups] = await Promise.all([
    getAllNations().catch(() => []),
    getGroupsView().catch(() => [] as GroupView[]),
  ]);
  const byCode = new Map(nations.map((n) => [n.countryCode, n]));

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <Breadcrumbs
          trail={[
            { label: "VM", href: "/vm" },
            { label: "GRUPPSPEL" },
          ]}
          right={
            <Link href="/vm/slutspel" className="text-cyan hover:text-yellow">
              SLUTSPEL →
            </Link>
          }
        />

        <section className="py-6">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-yellow">
            GRUPPSPEL
          </h1>
          <p className="mt-2 text-sm text-dim">
            Alla 48 landslag i VM 2026 indelade i sina gruppspels-grupper.
            Tabellen uppdateras direkt från Aftonbladet. FIFA-rank som
            referens ({FIFA_RANK_SOURCE_DATE}).
          </p>
        </section>

        <div className="space-y-6">
          {groups.map((g) => (
            <GroupSection key={g.group.externalId} view={g} byCode={byCode} />
          ))}
        </div>
      </div>
    </main>
  );
}

function GroupSection({
  view,
  byCode,
}: {
  view: GroupView;
  byCode: Map<string, { dreamTeamValueSek: number | null }>;
}) {
  return (
    <section
      id={`grupp-${view.group.letter}`}
      className="border border-border"
    >
      <header className="flex items-baseline justify-between gap-3 border-b border-border px-3 py-2 text-xs uppercase tracking-widest">
        <span>
          <span className="text-dim">GRUPP </span>
          <span className="text-yellow">{view.group.letter}</span>
        </span>
        <span className="text-[10px] text-dim">
          {view.standings.length} LAG
        </span>
      </header>

      <table className="w-full text-[11px] tabular-nums">
        <thead className="text-[9px] uppercase tracking-widest text-dim">
          <tr>
            <th className="px-2 py-1 text-left">#</th>
            <th className="px-2 py-1 text-left">LAG</th>
            <th className="px-2 py-1 text-right">M</th>
            <th className="px-2 py-1 text-right">V</th>
            <th className="px-2 py-1 text-right">O</th>
            <th className="px-2 py-1 text-right">F</th>
            <th className="px-2 py-1 text-right">+/−</th>
            <th className="px-2 py-1 text-right text-yellow">P</th>
            <th className="px-2 py-1 text-right text-green">XI</th>
          </tr>
        </thead>
        <tbody>
          {view.standings.map((row, i) => {
            const team = view.teamsById.get(row.teamId);
            const code = team?.code ?? "";
            const xi = byCode.get(code)?.dreamTeamValueSek ?? null;
            return (
              <tr
                key={row.teamId}
                className={`border-t border-border/60 transition hover:bg-yellow/5 ${i < 2 ? "" : i === 2 ? "" : "opacity-90"}`}
              >
                <td className="px-2 py-1 text-dim">{row.rank}</td>
                <td className="px-2 py-1">
                  {team ? (
                    <Link
                      href={`/landslag/${team.code}`}
                      className="inline-flex items-center gap-2 hover:text-yellow"
                    >
                      <Jersey code={team.code} size={20} />
                      <span className="truncate">{team.name}</span>
                      <span className="text-[9px] uppercase tracking-widest text-dim">
                        FIFA{" "}
                        {fifaRank(team.code) === null
                          ? "—"
                          : `#${fifaRank(team.code)}`}
                      </span>
                    </Link>
                  ) : (
                    <span className="text-dim">— okänd —</span>
                  )}
                </td>
                <td className="px-2 py-1 text-right text-foreground">{row.matches}</td>
                <td className="px-2 py-1 text-right text-foreground">{row.wins}</td>
                <td className="px-2 py-1 text-right text-foreground">{row.draws}</td>
                <td className="px-2 py-1 text-right text-foreground">{row.losses}</td>
                <td className="px-2 py-1 text-right text-foreground">
                  {row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}
                </td>
                <td className="px-2 py-1 text-right text-yellow font-bold">{row.points}</td>
                <td className="px-2 py-1 text-right text-green">
                  {xi === null ? "—" : `${(xi / 1_000_000).toFixed(0)}M`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {view.matches.length > 0 && (
        <details className="border-t border-border/60">
          <summary className="cursor-pointer px-3 py-2 text-[10px] uppercase tracking-widest text-dim hover:text-cyan">
            MATCHER ({view.matches.length}) ▾
          </summary>
          <div className="px-3 pb-3">
            {/* Group stage runs across rounds 1–3 (one matchday each).
                Render a sub-header per matchday for orientation. */}
            {[1, 2, 3].map((round) => {
              const inRound = view.matches.filter((m) => m.roundNumber === round);
              if (inRound.length === 0) return null;
              return (
                <div key={round} className="mt-2 first:mt-0">
                  <Link
                    href={`/vm/omgang/${round}`}
                    className="block border-b border-border/40 pb-0.5 text-[9px] uppercase tracking-widest text-yellow/80 hover:text-yellow"
                  >
                    OMGÅNG {round} →
                  </Link>
                  <ul className="divide-y divide-border/40">
                    {inRound.map((m) => (
                      <WcMatchLine
                        key={m.externalId}
                        m={m}
                        teamsById={view.teamsById}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </section>
  );
}

