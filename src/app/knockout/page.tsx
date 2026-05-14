import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Jersey } from "@/lib/jersey";
import { getKnockoutView, type WcMatch, type WcTeam } from "@/lib/wc-tournament";

export const dynamic = "force-dynamic";

export default async function KnockoutPage() {
  const view = await getKnockoutView();
  const byStage = new Map(view.stages.map((s) => [s.stage, s]));
  const totalMatches = view.stages.reduce((n, s) => n + s.matches.length, 0);

  // Mirror bracket: split each stage's matches in half so the final ends up
  // in the middle of the page. Top column flows down (R32 → ... → SF), the
  // bottom column flows down again (SF → ... → R32) but represents the
  // opposite half of the draw. Final + Bronze sit in the middle. We split
  // by index — when the real draw lands, Aftonbladet's order in the
  // matches array should reflect bracket position.
  const half = (s: ReturnType<typeof byStage.get>) => {
    const ms = s?.matches ?? [];
    const mid = Math.ceil(ms.length / 2);
    return { top: ms.slice(0, mid), bottom: ms.slice(mid) };
  };
  const r32 = half(byStage.get("r32"));
  const r16 = half(byStage.get("r16"));
  const qf = half(byStage.get("qf"));
  const sf = half(byStage.get("sf"));
  const finalMatches = byStage.get("final")?.matches ?? [];
  const bronzeMatches = byStage.get("bronze")?.matches ?? [];

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-md">
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
            Slutspelsschema från Aftonbladet, läst direkt mot turneringen.
            Spegel-bracket: scrolla nedåt — finalen ligger i mitten,
            R32 högst upp och längst ned. Totalt {totalMatches} matcher.
          </p>
        </section>

        <div className="space-y-6">
          <StageBlock label="ÅTTONDEL (32)" matches={r32.top} teamsById={view.teamsById} flow="down" />
          <StageBlock label="ÅTTONDELSFINAL" matches={r16.top} teamsById={view.teamsById} flow="down" />
          <StageBlock label="KVARTSFINAL" matches={qf.top} teamsById={view.teamsById} flow="down" />
          <StageBlock label="SEMIFINAL" matches={sf.top} teamsById={view.teamsById} flow="down" />

          {/* Middle: final + bronze */}
          <div className="border-y-2 border-yellow py-3">
            <StageBlock
              label="FINAL"
              matches={finalMatches}
              teamsById={view.teamsById}
              flow="down"
              accent="yellow"
            />
            {bronzeMatches.length > 0 && (
              <div className="mt-3">
                <StageBlock
                  label="BRONSMATCH"
                  matches={bronzeMatches}
                  teamsById={view.teamsById}
                  flow="down"
                  muted
                />
              </div>
            )}
          </div>

          <StageBlock label="SEMIFINAL" matches={sf.bottom} teamsById={view.teamsById} flow="up" />
          <StageBlock label="KVARTSFINAL" matches={qf.bottom} teamsById={view.teamsById} flow="up" />
          <StageBlock label="ÅTTONDELSFINAL" matches={r16.bottom} teamsById={view.teamsById} flow="up" />
          <StageBlock label="ÅTTONDEL (32)" matches={r32.bottom} teamsById={view.teamsById} flow="up" />
        </div>
      </div>
    </main>
  );
}

function StageBlock({
  label,
  matches,
  teamsById,
  flow,
  accent,
  muted,
}: {
  label: string;
  matches: WcMatch[];
  teamsById: Map<number, WcTeam>;
  /** Direction the eye should travel toward the final: "down" on top half,
   *  "up" on bottom half. Drives a small arrow under each match. */
  flow: "up" | "down";
  accent?: "yellow";
  muted?: boolean;
}) {
  if (matches.length === 0) {
    return (
      <section>
        <StageHeader label={label} count={0} accent={accent} muted={muted} />
        <p className="border border-dashed border-border p-3 text-[10px] uppercase tracking-widest text-dim">
          — väntar på lottning —
        </p>
      </section>
    );
  }
  return (
    <section>
      <StageHeader label={label} count={matches.length} accent={accent} muted={muted} />
      <ul className="space-y-2">
        {matches.map((m, i) => (
          <li key={m.externalId}>
            <BracketCell m={m} teamsById={teamsById} accent={accent} />
            {/* Connector between matches (except the last). */}
            {i < matches.length - 1 && flow === "down" && (
              <p aria-hidden="true" className="mt-1 text-center text-[10px] text-dim/60">
                │
              </p>
            )}
            {i < matches.length - 1 && flow === "up" && (
              <p aria-hidden="true" className="mt-1 text-center text-[10px] text-dim/60">
                │
              </p>
            )}
          </li>
        ))}
        {/* Arrow toward the final */}
        {matches.length > 0 && !accent && (
          <li
            aria-hidden="true"
            className="text-center text-[12px] text-dim/80"
          >
            {flow === "down" ? "▼" : "▲"}
          </li>
        )}
      </ul>
    </section>
  );
}

function StageHeader({
  label,
  count,
  accent,
  muted,
}: {
  label: string;
  count: number;
  accent?: "yellow";
  muted?: boolean;
}) {
  const cls = accent
    ? "text-yellow font-bold"
    : muted
      ? "text-dim"
      : "text-cyan";
  return (
    <h2
      className={`mb-2 flex items-baseline justify-between border-b border-border pb-1 text-[10px] uppercase tracking-widest ${cls}`}
    >
      <span>{label}</span>
      <span className="text-dim">{count}</span>
    </h2>
  );
}

function BracketCell({
  m,
  teamsById,
  accent,
}: {
  m: WcMatch;
  teamsById: Map<number, WcTeam>;
  accent?: "yellow";
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
    <article className={`border ${accent === "yellow" ? "border-yellow bg-yellow/5" : "border-border bg-black/30"}`}>
      <div className="flex items-center justify-between border-b border-border/60 px-2 py-0.5 text-[9px] uppercase tracking-widest text-dim">
        <span>
          {date} {time}
        </span>
        {m.status === "ongoing" && <span className="text-cyan">● LIVE</span>}
      </div>
      <Side team={home} score={m.homeScore} winner={homeWins} loser={played && !homeWins} />
      <Side team={away} score={m.awayScore} winner={awayWins} loser={played && !awayWins} />
    </article>
  );
}

function Side({
  team,
  score,
  winner,
  loser,
}: {
  team: WcTeam | undefined;
  score: number | null;
  winner: boolean;
  loser: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[auto_1fr_auto] items-center gap-2 px-2 py-1.5 text-[12px] ${
        winner ? "text-yellow font-bold" : loser ? "text-dim" : "text-foreground"
      }`}
    >
      {team ? <Jersey code={team.code} size={18} /> : <span className="h-[18px] w-[18px]" />}
      <span className="min-w-0 truncate">
        {team ? (
          <Link href={`/landslag/${team.code}`} className="hover:text-cyan">
            {team.name}
          </Link>
        ) : (
          <span className="text-dim">TBD</span>
        )}
      </span>
      <span className="tabular-nums text-[13px]">{score === null ? "" : score}</span>
    </div>
  );
}
