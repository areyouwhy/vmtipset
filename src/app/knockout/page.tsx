import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Jersey } from "@/lib/jersey";
import { getKnockoutView, type WcMatch, type WcTeam } from "@/lib/wc-tournament";

export const dynamic = "force-dynamic";

export default async function KnockoutPage() {
  const view = await getKnockoutView();
  const totalMatches = view.stages.reduce((n, s) => n + s.matches.length, 0);

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-5xl">
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
            Slutspelsschema från Aftonbladet. Innan en match är spelad visas
            kvalifikationsregeln (t.ex. &quot;Etta Grupp A&quot;). Totalt{" "}
            {totalMatches} slutspelsmatcher.
          </p>
        </section>

        {/* Horizontal scrolling bracket — columns are stages. */}
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="flex min-w-max gap-4">
            {view.stages.map((s) => (
              <StageColumn
                key={s.stage}
                label={s.label}
                matches={s.matches}
                teamsById={view.teamsById}
              />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

function StageColumn({
  label,
  matches,
  teamsById,
}: {
  label: string;
  matches: WcMatch[];
  teamsById: Map<number, WcTeam>;
}) {
  // Vertical spacing scales with stage depth so the bracket reads visually.
  // 32 matches → 1, 16 → 2, 8 → 4, etc. We use a CSS gap proportional to that.
  const gapClass =
    matches.length >= 16
      ? "gap-2"
      : matches.length >= 8
        ? "gap-6"
        : matches.length >= 4
          ? "gap-14"
          : matches.length >= 2
            ? "gap-28"
            : "gap-0";

  return (
    <section className="flex w-[220px] shrink-0 flex-col">
      <h2 className="mb-2 border-b border-border pb-1 text-[10px] uppercase tracking-widest text-dim">
        {label}{" "}
        <span className="text-cyan">{matches.length}</span>
      </h2>
      <div className={`flex flex-col ${gapClass}`}>
        {matches.length === 0 ? (
          <p className="border border-dashed border-border p-3 text-[10px] text-dim">
            — väntar på lottning —
          </p>
        ) : (
          matches.map((m) => (
            <BracketCell key={m.externalId} m={m} teamsById={teamsById} />
          ))
        )}
      </div>
    </section>
  );
}

function BracketCell({
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
  const homeWins = played && (m.homeScore ?? 0) > (m.awayScore ?? 0);
  const awayWins = played && (m.awayScore ?? 0) > (m.homeScore ?? 0);
  return (
    <article className="border border-border bg-black/30">
      <div className="border-b border-border/60 px-2 py-0.5 text-[9px] uppercase tracking-widest text-dim">
        {date} {time}
        {m.status === "ongoing" && (
          <span className="ml-2 text-cyan">● LIVE</span>
        )}
      </div>
      <Side
        team={home}
        score={m.homeScore}
        winner={homeWins}
        loser={played && !homeWins}
        placeholder="TBD"
      />
      <Side
        team={away}
        score={m.awayScore}
        winner={awayWins}
        loser={played && !awayWins}
        placeholder="TBD"
      />
    </article>
  );
}

function Side({
  team,
  score,
  winner,
  loser,
  placeholder,
}: {
  team: WcTeam | undefined;
  score: number | null;
  winner: boolean;
  loser: boolean;
  placeholder: string;
}) {
  return (
    <div
      className={`grid grid-cols-[auto_1fr_auto] items-center gap-2 px-2 py-1 text-[11px] ${
        winner ? "text-yellow" : loser ? "text-dim" : "text-foreground"
      }`}
    >
      {team ? <Jersey code={team.code} size={16} /> : <span className="w-4" />}
      <span className="min-w-0 truncate">
        {team ? (
          <Link href={`/landslag/${team.code}`} className="hover:text-cyan">
            {team.name}
          </Link>
        ) : (
          <span className="text-dim">{placeholder}</span>
        )}
      </span>
      <span className="tabular-nums">
        {score === null ? "" : score}
      </span>
    </div>
  );
}
