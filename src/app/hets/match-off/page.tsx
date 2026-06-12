import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { getRivalry, resolveSide } from "@/lib/rivalries";
import { getMyVote, getVoteSummary } from "@/lib/rivalry-votes";
import { teamSlug } from "@/lib/team-slug";
import { MatchupBody } from "../matchup";
import { getRivalryData } from "../rivalry-data";
import { ACCENT_BORDER, ACCENT_TEXT, RivalryShell } from "../rivalry-ui";
import { VotePanel } from "../vote-panel";

export const revalidate = 300;

export const metadata = {
  title: "LLM vs Caco AI — Copa del Mundo 2026",
  description: "Large Lindmarker Model vs El Bizteka — modell mot modell.",
};

export default async function MatchOffPage() {
  const rivalry = getRivalry("match-off")!;
  const { userId } = await auth();
  const [{ rowsByName, squadByTeamId, anyScored }, summary, myVote] =
    await Promise.all([
      getRivalryData(),
      getVoteSummary("match-off"),
      userId ? getMyVote("match-off", userId) : Promise.resolve(null),
    ]);

  const [sideA, sideB] = rivalry.sides.map((s) => resolveSide(s, rowsByName));
  const rowA = sideA.members[0]?.row ?? null;
  const rowB = sideB.members[0]?.row ?? null;
  const voteSides = rivalry.sides.map((s) => ({
    key: s.key,
    label: s.label,
    accent: s.accent,
  }));

  return (
    <RivalryShell title={rivalry.title} tagline={rivalry.tagline}>
      <VotePanel
        rivalrySlug="match-off"
        sides={voteSides}
        summary={summary}
        myVote={myVote}
        signedIn={!!userId}
      />

      {/* External model sites */}
      <div className="mt-6 grid grid-cols-2 gap-2">
        {[sideA, sideB].map((side) => (
          <div
            key={side.key}
            className={`border ${ACCENT_BORDER[side.accent]} p-3`}
          >
            <p className={`text-xs font-bold uppercase tracking-widest ${ACCENT_TEXT[side.accent]}`}>
              {side.label}
            </p>
            {side.link && (
              <a
                href={side.link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 block text-xs text-cyan hover:underline"
              >
                {side.link.label} ↗
              </a>
            )}
          </div>
        ))}
      </div>

      {rowA && rowB ? (
        <section className="mt-4 border border-border">
          <MatchupBody
            a={rowA}
            b={rowB}
            squadA={squadByTeamId[rowA.teamId] ?? null}
            squadB={squadByTeamId[rowB.teamId] ?? null}
            anyScored={anyScored}
            aAccent={ACCENT_TEXT[sideA.accent]}
            bAccent={ACCENT_TEXT[sideB.accent]}
            verdictClass="border-t border-border text-foreground"
          />
        </section>
      ) : (
        <MissingNote sideA={rowA} sideB={rowB} aName={sideA.members[0]?.teamName} bName={sideB.members[0]?.teamName} />
      )}

      <p className="mt-4 text-[10px] uppercase tracking-widest text-dim">
        {rowA && (
          <Link href={`/team/${teamSlug(rowA.teamName)}`} className="text-cyan">
            {rowA.teamName} →
          </Link>
        )}
        {rowA && rowB && <span className="mx-2 text-dim">·</span>}
        {rowB && (
          <Link href={`/team/${teamSlug(rowB.teamName)}`} className="text-cyan">
            {rowB.teamName} →
          </Link>
        )}
      </p>
    </RivalryShell>
  );
}

function MissingNote({
  sideA,
  sideB,
  aName,
  bName,
}: {
  sideA: unknown;
  sideB: unknown;
  aName?: string;
  bName?: string;
}) {
  const missing = [!sideA ? aName : null, !sideB ? bName : null].filter(Boolean);
  return (
    <p className="mt-4 border border-yellow/30 bg-yellow/5 p-4 text-sm text-dim">
      Hittar inte {missing.join(" och ")} i tabellen just nu. Lagnamnet kan ha
      ändrats — kolla mappningen.
    </p>
  );
}
