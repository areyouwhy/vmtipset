import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";
import { db } from "@/db";
import { teams } from "@/db/schema";
import { getOrCreateDbUser, isAdmin } from "@/lib/auth";
import { getLeaderboard } from "@/lib/leaderboard";
import { getOpenBetsForUser } from "@/lib/bets-data";
import { getActiveRound, getCurrentSquad } from "@/lib/squad-data";
import { BetsSection } from "./bets-section";
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

  // Active round is shown for everyone (signed-in) — gives users a clear
  // signal of what they're picking for, even before they're approved.
  const activeRound = team ? await getActiveRound() : null;
  const squad =
    team && activeRound && user.status === "approved"
      ? await getCurrentSquad(team.id, activeRound.id)
      : null;

  const statusLabel: Record<typeof user.status, string> = {
    pending: "VÄNTAR PÅ GODKÄNNANDE",
    approved: "GODKÄND",
    rejected: "AVVISAD",
  };
  const statusColor: Record<typeof user.status, string> = {
    pending: "text-yellow",
    approved: "text-green",
    rejected: "text-red",
  };

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

  // Open bets for this team (if approved)
  let openBets: Awaited<ReturnType<typeof getOpenBetsForUser>> | null = null;
  if (team && user.status === "approved") {
    openBets = await getOpenBetsForUser(team.id);
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

        <section className="border-b border-border py-4 text-xs uppercase tracking-widest">
          <p>
            <span className="text-dim">LOGGAD IN </span>
            <span className="text-yellow">{handle}</span>
            {team ? (
              <>
                <span className="text-dim"> · </span>
                <span className="text-foreground">{team.name}</span>
                <span className="text-dim"> · </span>
                <span className={statusColor[user.status]}>
                  {statusLabel[user.status]}
                </span>
              </>
            ) : (
              <>
                <span className="text-dim"> · </span>
                <span className="text-dim">INGET LAG</span>
              </>
            )}
          </p>
          <p className="mt-2">
            <span className="text-dim">AKTIV ROND </span>
            {activeRound ? (
              <span className="text-yellow">
                #{activeRound.number} · {activeRound.name}
              </span>
            ) : (
              <span className="text-dim">— ingen öppen —</span>
            )}
          </p>
        </section>

        <div className="space-y-6 border-t border-border pt-6">
          {!team && <CreateTeamForm />}
          {team && user.status === "pending" && (
            <PendingPanel team={team} email={user.email} />
          )}
          {team && user.status === "approved" && (
            <>
              <SquadStatusPanel
                activeRound={activeRound}
                squadPlayerCount={squad?.playerIds.length ?? 0}
                locked={squad?.lockedAt != null}
              />
              {myStanding && (
                <StandingPanel
                  teamId={team.id}
                  rank={myStanding.rank}
                  total={myStanding.total}
                  lastRoundPoints={myStanding.lastRoundPoints}
                />
              )}
              {openBets && (
                <BetsSection
                  bets={openBets.bets}
                  myAnswers={Array.from(openBets.myAnswersByBet.entries()).map(
                    ([betId, answer]) => ({ betId, answer }),
                  )}
                />
              )}
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

function SquadStatusPanel({
  activeRound,
  squadPlayerCount,
  locked,
}: {
  activeRound: { number: number; name: string; deadline: Date | null } | null;
  squadPlayerCount: number;
  locked: boolean;
}) {
  if (!activeRound) {
    return (
      <section className="border border-border p-5">
        <p className="text-[10px] uppercase tracking-widest text-dim">
          STATUS
        </p>
        <p className="mt-2 text-xl font-bold uppercase tracking-tight text-foreground">
          INGEN ÖPPEN ROND
        </p>
        <p className="mt-2 text-sm text-dim">
          Admin har inte öppnat någon rond än. Du behöver inte göra något just nu.
        </p>
      </section>
    );
  }

  const isReady = squadPlayerCount === 11;
  const tone: "green" | "yellow" | "dim" = locked ? "dim" : isReady ? "green" : "yellow";
  const borderClass = {
    green: "border-green",
    yellow: "border-yellow",
    dim: "border-border",
  }[tone];
  const headerClass = {
    green: "text-green",
    yellow: "text-yellow",
    dim: "text-dim",
  }[tone];

  const headline = locked
    ? "TRUPP LÅST"
    : isReady
      ? "DU ÄR KLAR"
      : "INTE KLAR";
  const subline = locked
    ? `Truppen är låst för ${activeRound.name}. Inväntar matcher.`
    : isReady
      ? `Du har valt ${squadPlayerCount} av 11 spelare för ${activeRound.name}. Du kan fortsätta justera tills deadline.`
      : squadPlayerCount === 0
        ? `Du har inte byggt din trupp för ${activeRound.name} än.`
        : `Du har bara valt ${squadPlayerCount} av 11 spelare för ${activeRound.name}.`;

  const ctaLabel = locked
    ? "[ VISA TRUPP ]"
    : isReady
      ? "[ REDIGERA TRUPP → ]"
      : "[ BYGG TRUPP → ]";

  return (
    <section className={`border ${borderClass} p-5`}>
      <p
        className={`text-[10px] uppercase tracking-widest ${headerClass}`}
      >
        STATUS · ROND #{activeRound.number} {activeRound.name}
      </p>
      <p
        className={`mt-2 text-2xl font-bold uppercase tracking-tight ${headerClass}`}
      >
        {headline}
      </p>
      <p className="mt-2 text-sm text-dim">{subline}</p>

      {!locked && activeRound.deadline && (
        <CountdownLine deadline={activeRound.deadline} />
      )}

      <Link
        href="/app/squad"
        className={`mt-5 block w-full border px-6 py-3 text-center text-sm font-bold uppercase tracking-widest transition hover:opacity-90 ${
          locked
            ? "border-border text-dim"
            : isReady
              ? "border-green bg-green text-black"
              : "border-yellow bg-yellow text-black"
        }`}
      >
        {ctaLabel}
      </Link>
    </section>
  );
}

function CountdownLine({ deadline }: { deadline: Date }) {
  // eslint-disable-next-line react-hooks/purity
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms < 0) {
    return (
      <p className="mt-3 text-xs uppercase tracking-widest text-red">
        ! DEADLINE PASSERAD
      </p>
    );
  }
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const time =
    days > 0
      ? `${days}d ${hours}h kvar`
      : hours > 0
        ? `${hours}h ${mins}m kvar`
        : `${mins}m kvar`;
  return (
    <p className="mt-3 text-xs uppercase tracking-widest text-dim">
      DEADLINE{" "}
      <span className="text-foreground">
        {new Date(deadline).toISOString().slice(0, 16).replace("T", " ")} UTC
      </span>{" "}
      <span className="text-foreground tabular-nums">· {time}</span>
    </p>
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
