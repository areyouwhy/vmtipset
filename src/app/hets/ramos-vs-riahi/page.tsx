import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { getRivalry, resolveSide, type ResolvedSide } from "@/lib/rivalries";
import { getMyVote, getVoteSummary } from "@/lib/rivalry-votes";
import { teamSlug } from "@/lib/team-slug";
import { fmtNullSek, fmtSek } from "../matchup";
import { getRivalryData } from "../rivalry-data";
import { ACCENT_BG, ACCENT_BORDER, ACCENT_TEXT, RivalryShell } from "../rivalry-ui";
import { VotePanel } from "../vote-panel";

export const revalidate = 300;

export const metadata = {
  title: "RAMOS VS. RIAHI — Copa del Mundo 2026",
  description: "Tre mot tre. Summan av lagvärdet avgör.",
};

export default async function RamosVsRiahiPage() {
  const rivalry = getRivalry("ramos-vs-riahi")!;
  const { userId } = await auth();
  const [{ rowsByName, anyScored }, summary, myVote] = await Promise.all([
    getRivalryData(),
    getVoteSummary("ramos-vs-riahi"),
    userId ? getMyVote("ramos-vs-riahi", userId) : Promise.resolve(null),
  ]);
  const [sideA, sideB] = rivalry.sides.map((s) => resolveSide(s, rowsByName));
  const voteSides = rivalry.sides.map((s) => ({
    key: s.key,
    label: s.label,
    accent: s.accent,
  }));

  return (
    <RivalryShell title={rivalry.title} tagline={rivalry.tagline}>
      <VotePanel
        rivalrySlug="ramos-vs-riahi"
        sides={voteSides}
        summary={summary}
        myVote={myVote}
        signedIn={!!userId}
      />

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SideColumn side={sideA} />
        <SideColumn side={sideB} />
      </div>

      <p className="mt-4 border border-magenta/40 bg-magenta/5 px-3 py-3 text-xs text-magenta">
        {campVerdict(sideA, sideB)}
        {!anyScored && (
          <span className="ml-1 text-dim">
            (rankas på lagvärde tills första ronden är poängsatt)
          </span>
        )}
      </p>
    </RivalryShell>
  );
}

function SideColumn({ side }: { side: ResolvedSide }) {
  return (
    <section className={`border ${ACCENT_BORDER[side.accent]} ${ACCENT_BG[side.accent]}`}>
      <header className={`border-b ${ACCENT_BORDER[side.accent]} px-3 py-2`}>
        <p className={`text-sm font-bold uppercase tracking-widest ${ACCENT_TEXT[side.accent]}`}>
          {side.label}
        </p>
      </header>

      {/* aggregate */}
      <dl className="grid grid-cols-2 gap-px border-b border-border bg-border text-center">
        <AggStat label="SUMMA LAGVÄRDE" value={fmtNullSek(side.totalTeamValueSek)} accent />
        <AggStat label="SUMMA TILLVÄXT" value={fmtNullSek(side.totalGrowthSek)} />
      </dl>

      {/* members */}
      <ul className="divide-y divide-border/60">
        {side.members.map((m) => (
          <li key={m.teamName} className="px-3 py-2 text-xs">
            <div className="flex items-baseline justify-between gap-2">
              {m.row ? (
                <Link
                  href={`/team/${teamSlug(m.row.teamName)}`}
                  className="min-w-0 truncate text-foreground hover:text-cyan"
                >
                  <span className="mr-1 tabular-nums text-dim">
                    #{m.row.rank}
                  </span>
                  {m.teamName}
                </Link>
              ) : (
                <span className="min-w-0 truncate text-dim">
                  {m.teamName}{" "}
                  <span className="text-[9px] uppercase tracking-widest text-red">
                    saknas
                  </span>
                </span>
              )}
              <span className="shrink-0 tabular-nums text-yellow">
                {fmtNullSek(m.row?.teamValueSek ?? null)}
              </span>
            </div>
            {m.row && (
              <p className="text-[10px] uppercase tracking-widest text-dim">
                {m.row.ownerHandle} · TILLVÄXT{" "}
                <span
                  className={
                    m.row.roundGrowthSek !== null && m.row.roundGrowthSek < 0
                      ? "text-red"
                      : "text-dim"
                  }
                >
                  {fmtNullSek(m.row.roundGrowthSek)}
                </span>
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function AggStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-background px-2 py-2">
      <dt className="text-[9px] uppercase tracking-widest text-dim">{label}</dt>
      <dd className={`mt-0.5 text-sm font-bold tabular-nums ${accent ? "text-yellow" : "text-foreground"}`}>
        {value}
      </dd>
    </div>
  );
}

function campVerdict(a: ResolvedSide, b: ResolvedSide): string {
  const av = a.totalTeamValueSek ?? 0;
  const bv = b.totalTeamValueSek ?? 0;
  if (av === bv) return "Helt jämnt mellan lägren. Ingen får säga ett ord.";
  const leader = av > bv ? a : b;
  const loser = av > bv ? b : a;
  const diff = Math.abs(av - bv);
  return `Lag ${leader.label} leder med ${fmtSek(diff)} i samlat lagvärde. Lag ${loser.label} har en del kvar att snacka ihop.`;
}
