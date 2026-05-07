import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";
import { db } from "@/db";
import { teams } from "@/db/schema";
import { getOrCreateDbUser, isAdmin } from "@/lib/auth";
import { getLeaderboard } from "@/lib/leaderboard";
import { getActiveRound, getCurrentSquad } from "@/lib/squad-data";
import { CreateTeamForm } from "./create-team-form";
import { PendingPanel } from "./pending-panel";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  const user = await getOrCreateDbUser();
  if (!user) redirect("/");

  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.ownerUserId, user.id))
    .limit(1);

  const admin = await isAdmin();
  const handle = user.displayName || user.email.split("@")[0];

  const activeRound = team && user.status === "approved" ? await getActiveRound() : null;
  const squad =
    team && activeRound ? await getCurrentSquad(team.id, activeRound.id) : null;

  // Pull leaderboard row for this team if any rounds have been scored
  let myStanding: { rank: number; total: number; lastRoundPoints: number | null } | null = null;
  if (team && user.status === "approved") {
    const lb = await getLeaderboard();
    const me = lb.rows.find((r) => r.teamId === team.id);
    const lastScored = lb.rounds.filter((r) => r.isScored).at(-1);
    if (me && lastScored) {
      const lastPoints =
        me.perRound.find((p) => p.roundId === lastScored.id)?.pointsSek ?? null;
      myStanding = { rank: me.rank, total: me.totalPointsSek, lastRoundPoints: lastPoints };
    }
  }

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <header className="flex items-center justify-between border-b border-border pb-3 text-xs uppercase tracking-widest">
          <span className="text-yellow">COPA / APP</span>
          <div className="flex items-center gap-4">
            {admin && (
              <a href="/admin" className="text-cyan">
                ADMIN
              </a>
            )}
            <SignOutButton><button className="text-dim hover:text-red">LOGGA UT</button></SignOutButton>
          </div>
        </header>

        <section className="py-6">
          <p className="text-[10px] uppercase tracking-widest text-dim">
            INLOGGAD SOM
          </p>
          <p className="mt-1 text-lg text-foreground">
            <span className="text-yellow">{">"} </span>
            {handle}
          </p>
        </section>

        <div className="space-y-6 border-t border-border pt-6">
          {!team && <CreateTeamForm />}
          {team && user.status === "pending" && (
            <PendingPanel team={team} email={user.email} />
          )}
          {team && user.status === "approved" && (
            <>
              {myStanding && (
                <StandingPanel
                  teamId={team.id}
                  rank={myStanding.rank}
                  total={myStanding.total}
                  lastRoundPoints={myStanding.lastRoundPoints}
                />
              )}
              <ApprovedPanel
                teamName={team.name}
                hasSquad={(squad?.playerIds.length ?? 0) > 0}
                activeRoundName={activeRound?.name ?? null}
                locked={squad?.lockedAt != null}
              />
            </>
          )}
          {user.status === "rejected" && <RejectedPanel />}
        </div>
      </div>
    </main>
  );
}

function StandingPanel({
  teamId,
  rank,
  total,
  lastRoundPoints,
}: {
  teamId: string;
  rank: number;
  total: number;
  lastRoundPoints: number | null;
}) {
  return (
    <section className="border border-yellow p-4">
      <p className="text-[10px] uppercase tracking-widest text-yellow">
        DIN STÄLLNING
      </p>
      <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-dim">
            PLACERING
          </p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums text-yellow">
            #{rank}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-dim">
            TOTAL
          </p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums text-yellow">
            {fmtSek(total)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-dim">
            SENASTE
          </p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums text-yellow">
            {lastRoundPoints === null ? "—" : fmtSek(lastRoundPoints)}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        <Link href="/leaderboard" className="text-cyan hover:underline">
          [ HELA TABELLEN ]
        </Link>
        <Link href={`/team/${teamId}`} className="text-cyan hover:underline">
          [ MITT LAG ]
        </Link>
      </div>
    </section>
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

function ApprovedPanel({
  teamName,
  hasSquad,
  activeRoundName,
  locked,
}: {
  teamName: string;
  hasSquad: boolean;
  activeRoundName: string | null;
  locked: boolean;
}) {
  return (
    <section className="border border-green p-5">
      <p className="text-[10px] uppercase tracking-widest text-green">
        STATUS / GODKÄND
      </p>
      <h2 className="mt-2 text-2xl font-bold uppercase tracking-tight text-foreground">
        DU ÄR MED I LIGAN
      </h2>
      <p className="mt-3 text-sm text-dim">
        <span className="text-yellow">{teamName}</span> är godkänt.
        {activeRoundName ? (
          <>
            {" "}
            Aktiv rond:{" "}
            <span className="text-foreground">{activeRoundName}</span>.
          </>
        ) : (
          " Väntar på att admin öppnar en rond."
        )}
      </p>

      {activeRoundName && (
        <Link
          href="/app/squad"
          className="mt-5 block w-full border border-yellow bg-yellow px-6 py-3 text-center text-sm font-bold uppercase tracking-widest text-black transition hover:opacity-90"
        >
          {locked
            ? "[ VISA TRUPP ]"
            : hasSquad
              ? "[ REDIGERA TRUPP → ]"
              : "[ BYGG TRUPP → ]"}
        </Link>
      )}
    </section>
  );
}

function RejectedPanel() {
  return (
    <section className="border border-red p-5">
      <p className="text-[10px] uppercase tracking-widest text-red">
        STATUS / AVVISAD
      </p>
      <h2 className="mt-2 text-xl font-bold uppercase tracking-tight">
        ANMÄLAN AVVISAD
      </h2>
      <p className="mt-3 text-sm text-dim">
        Hör av dig till Ruy om du tror det är ett misstag.
      </p>
    </section>
  );
}
