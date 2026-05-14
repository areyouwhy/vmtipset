import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Jersey } from "@/lib/jersey";
import { getKnockoutView, type WcMatch, type WcTeam } from "@/lib/wc-tournament";

export const dynamic = "force-dynamic";

export default async function KnockoutPage() {
  const view = await getKnockoutView();
  const byStage = new Map(view.stages.map((s) => [s.stage, s]));
  const r32 = byStage.get("r32")?.matches ?? [];
  const r16 = byStage.get("r16")?.matches ?? [];
  const qf = byStage.get("qf")?.matches ?? [];
  const sf = byStage.get("sf")?.matches ?? [];
  const finalAndBronze = [
    ...(byStage.get("final")?.matches ?? []),
    ...(byStage.get("bronze")?.matches ?? []),
  ];
  const totalMatches = view.stages.reduce((n, s) => n + s.matches.length, 0);

  // Column height drives bracket geometry. With `justify-around` on each
  // column, n cells get n equal slices — so a 4-cell QF column has its
  // cells centred at 1/8, 3/8, 5/8, 7/8 of the height. A 2-cell SF column
  // has cells centred at 1/4 and 3/4, which is exactly the midpoint of
  // each pair of QF cells. Proper bracket alignment for free.
  // Tall enough that 16 R32 cells stay legible.
  const TREE_HEIGHT = 960;

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-6xl">
        <Breadcrumbs
          trail={[{ label: "SLUTSPEL" }]}
          right={
            <Link href="/landslag" className="text-cyan hover:text-yellow">
              ← GRUPPSPEL
            </Link>
          }
        />

        <section className="py-6">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-yellow">
            SLUTSPEL
          </h1>
          <p className="mt-2 text-sm text-dim">
            Slutspels-träd från Aftonbladet. {totalMatches} matcher från
            32-delsfinal till final. Förlorande lag stryks över. Scrolla
            sidledes om allt inte får plats.
          </p>
        </section>

        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div
            className="flex min-w-max gap-3"
            style={{ height: `${TREE_HEIGHT}px` }}
          >
            <Column label="32-DELSFINAL" matches={r32} teamsById={view.teamsById} />
            <Column label="ÅTTONDEL" matches={r16} teamsById={view.teamsById} />
            <Column label="KVARTSFINAL" matches={qf} teamsById={view.teamsById} />
            <Column label="SEMIFINAL" matches={sf} teamsById={view.teamsById} />
            <Column
              label="FINAL"
              matches={finalAndBronze}
              teamsById={view.teamsById}
              accent
            />
          </div>
        </div>
      </div>
    </main>
  );
}

function Column({
  label,
  matches,
  teamsById,
  accent,
}: {
  label: string;
  matches: WcMatch[];
  teamsById: Map<number, WcTeam>;
  accent?: boolean;
}) {
  return (
    <section className="flex w-[200px] shrink-0 flex-col sm:w-[220px]">
      <h2
        className={`mb-2 flex items-baseline justify-between border-b pb-1 text-[10px] uppercase tracking-widest ${
          accent ? "border-yellow text-yellow" : "border-border text-cyan"
        }`}
      >
        <span>{label}</span>
        <span className="text-dim">{matches.length}</span>
      </h2>
      <ul className="flex flex-1 flex-col justify-around">
        {matches.length === 0 ? (
          <li className="border border-dashed border-border p-3 text-[10px] uppercase tracking-widest text-dim">
            — väntar på lottning —
          </li>
        ) : (
          matches.map((m) => (
            <li key={m.externalId}>
              <BracketCell m={m} teamsById={teamsById} accent={accent} />
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

function BracketCell({
  m,
  teamsById,
  accent,
}: {
  m: WcMatch;
  teamsById: Map<number, WcTeam>;
  accent?: boolean;
}) {
  const home = teamsById.get(m.homeTeamId);
  const away = teamsById.get(m.awayTeamId);
  const kickoff = new Date(m.kickoff);
  const dateLabel = kickoff.toLocaleDateString("sv-SE", {
    month: "short",
    day: "numeric",
  });
  const timeLabel = kickoff.toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const played = m.status === "finished" && m.homeScore !== null;
  const homeWon = played && (m.homeScore ?? 0) > (m.awayScore ?? 0);
  const awayWon = played && (m.awayScore ?? 0) > (m.homeScore ?? 0);
  const ongoing = m.status === "ongoing";

  return (
    <article
      className={`border bg-black/30 ${
        accent ? "border-yellow" : "border-border"
      }`}
    >
      <div className="grid grid-cols-[auto_1fr] items-stretch">
        {/* Left rail = date stack, like in the reference. */}
        <div className="flex flex-col items-center justify-center border-r border-border/70 px-1.5 py-1 text-[9px] uppercase leading-tight tracking-widest text-dim">
          <span>{dateLabel}</span>
          <span>{played ? "FT" : ongoing ? <span className="text-cyan">LIVE</span> : timeLabel}</span>
        </div>
        <div>
          <Side
            team={home}
            score={m.homeScore}
            winner={homeWon}
            loser={played && !homeWon}
            ongoing={ongoing}
          />
          <Side
            team={away}
            score={m.awayScore}
            winner={awayWon}
            loser={played && !awayWon}
            ongoing={ongoing}
            isBottom
          />
        </div>
      </div>
    </article>
  );
}

function Side({
  team,
  score,
  winner,
  loser,
  ongoing,
  isBottom,
}: {
  team: WcTeam | undefined;
  score: number | null;
  winner: boolean;
  loser: boolean;
  ongoing: boolean;
  isBottom?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[auto_auto_1fr] items-center gap-2 px-2 py-1 text-[12px] ${
        isBottom ? "border-t border-border/40" : ""
      } ${
        winner ? "text-yellow font-bold" : loser ? "text-dim line-through" : "text-foreground"
      } ${ongoing ? "text-cyan" : ""}`}
    >
      <span className="w-[26px] text-right tabular-nums text-[13px]">
        {score === null ? "" : score}
      </span>
      {team ? <Jersey code={team.code} size={16} /> : <span className="h-4 w-4" />}
      <span className="min-w-0 truncate">
        {team ? (
          <Link href={`/landslag/${team.code}`} className="hover:text-cyan">
            {team.name}
          </Link>
        ) : (
          <span className="text-dim">TBD</span>
        )}
      </span>
    </div>
  );
}
