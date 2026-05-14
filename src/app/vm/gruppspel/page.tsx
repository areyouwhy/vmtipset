import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Jersey } from "@/lib/jersey";
import { getAllNations } from "@/lib/nation-data";
import {
  getGroupsView,
  type GroupView,
  type WcMatch,
  type WcTeam,
} from "@/lib/wc-tournament";
import { fifaRank, FIFA_RANK_SOURCE_DATE } from "@/data/fifa-rank";

export const dynamic = "force-dynamic";

export default async function LandslagIndexPage() {
  const [nations, groups] = await Promise.all([
    getAllNations(),
    getGroupsView(),
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
          <ul className="divide-y divide-border/40 px-3 pb-3">
            {view.matches.map((m) => (
              <MatchLine key={m.externalId} m={m} teamsById={view.teamsById} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export function MatchLine({
  m,
  teamsById,
}: {
  m: WcMatch;
  teamsById: Map<number, WcTeam>;
}) {
  const home = teamsById.get(m.homeTeamId);
  const away = teamsById.get(m.awayTeamId);
  const kickoff = new Date(m.kickoff);
  const date = kickoff.toLocaleDateString("sv-SE", { month: "short", day: "numeric" });
  const time = kickoff.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  const played = m.status === "finished" && m.homeScore !== null;
  return (
    <li className="grid grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-2 py-1.5 text-[11px]">
      <span className="text-[9px] uppercase tracking-widest text-dim">
        {date} {time}
      </span>
      <span className="flex items-center justify-end gap-1.5">
        {home && (
          <Link href={`/landslag/${home.code}`} className="truncate hover:text-yellow">
            {home.name}
          </Link>
        )}
        {home && <Jersey code={home.code} size={16} />}
      </span>
      <span className="px-1 text-center text-yellow tabular-nums">
        {played
          ? `${m.homeScore}-${m.awayScore}`
          : m.status === "ongoing"
            ? "LIVE"
            : "—"}
      </span>
      <span className="flex items-center gap-1.5">
        {away && <Jersey code={away.code} size={16} />}
        {away && (
          <Link href={`/landslag/${away.code}`} className="truncate hover:text-yellow">
            {away.name}
          </Link>
        )}
      </span>
      <span></span>
    </li>
  );
}
