import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SignOutLink } from "./sign-out-link";
import { db } from "@/db";
import { teams } from "@/db/schema";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { getOrCreateDbUser, isAdmin } from "@/lib/auth";
import { getLeaderboard } from "@/lib/leaderboard";
import { getOpenBetsForUser } from "@/lib/bets-data";
import { getActiveRound, getCurrentSquad } from "@/lib/squad-data";
import { teamSlug } from "@/lib/team-slug";
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
    approved: "SWISHAD & KLAR",
    rejected: "AVVISAD",
  };
  const statusColor: Record<typeof user.status, string> = {
    pending: "text-yellow",
    approved: "text-green",
    rejected: "text-red",
  };

  // Squad chip in the identity row — only meaningful once the user is approved
  // and there's an active round. Mirrors SquadStatusPanel's tone logic.
  let squadChip: { label: string; color: string } | null = null;
  if (team && user.status === "approved" && activeRound) {
    const total = squad?.playerIds.length ?? 0;
    const dropped = squad?.droppedPlayers.length ?? 0;
    const active = total - dropped;
    const locked = squad?.lockedAt != null;
    if (locked) {
      squadChip = { label: "TRUPP LÅST", color: "text-dim" };
    } else if (dropped > 0) {
      squadChip = { label: "ERSÄTT BORTPLOCKADE", color: "text-yellow" };
    } else if (active === 11) {
      squadChip = { label: "TRUPP REDO", color: "text-green" };
    } else if (active === 0) {
      squadChip = { label: "INGEN TRUPP", color: "text-red" };
    } else {
      squadChip = { label: `TRUPP ${active}/11`, color: "text-yellow" };
    }
  }

  // Leaderboard powers both the standing panel and the league table. Fetch
  // once for any signed-in user (cheap; only teams + scores reads).
  const lb = await getLeaderboard();
  const anyScored = lb.rounds.some((r) => r.isScored);

  let myStanding: { rank: number; total: number; lastRoundPoints: number | null } | null = null;
  if (team && user.status === "approved") {
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
        <Breadcrumbs
          trail={[{ label: "APP" }]}
          right={
            <div className="flex items-center gap-4">
              {admin && (
                <a href="/admin" className="text-cyan">
                  ADMIN
                </a>
              )}
              <SignOutLink />
            </div>
          }
        />

        <section className="border-b border-border py-2 text-[11px] uppercase tracking-widest">
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-yellow">{handle}</span>
            {team ? (
              <>
                <span className="text-dim">·</span>
                <Link
                  href={`/team/${teamSlug(team.name)}`}
                  className="text-foreground hover:text-yellow"
                >
                  {team.name}
                </Link>
                <span className="text-dim">·</span>
                <span className={statusColor[user.status]}>
                  {statusLabel[user.status]}
                </span>
              </>
            ) : (
              <>
                <span className="text-dim">·</span>
                <span className="text-dim">INGET LAG</span>
              </>
            )}
            <span className="text-dim">·</span>
            {activeRound ? (
              <Link
                href={`/vm/omgang/${activeRound.number}`}
                className="text-yellow hover:text-cyan"
              >
                ROND #{activeRound.number}
              </Link>
            ) : (
              <span className="text-dim">INGEN ROND</span>
            )}
            {squadChip && (
              <>
                <span className="text-dim">·</span>
                <span className={squadChip.color}>{squadChip.label}</span>
              </>
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
                squadPlayerCount={
                  // Count only still-active picks so dropped players don't
                  // inflate the "DU ÄR KLAR" check.
                  (squad?.playerIds.length ?? 0) -
                  (squad?.droppedPlayers.length ?? 0)
                }
                droppedPlayers={squad?.droppedPlayers ?? []}
                locked={squad?.lockedAt != null}
              />
              {myStanding && (
                <StandingPanel
                  teamSlug={teamSlug(team.name)}
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

          {lb.rows.length > 0 && (
            <LeagueTablePanel
              rows={lb.rows}
              myTeamId={team?.id ?? null}
              anyScored={anyScored}
            />
          )}
        </div>
      </div>
    </main>
  );
}

function LeagueTablePanel({
  rows,
  myTeamId,
  anyScored,
}: {
  rows: Awaited<ReturnType<typeof getLeaderboard>>["rows"];
  myTeamId: string | null;
  anyScored: boolean;
}) {
  // rows are already in rank order from getLeaderboard — points when scored,
  // team value otherwise. Top 5 + always include the viewer's row if it falls
  // outside the cut.
  const TOP_N = 5;
  const top = rows.slice(0, TOP_N);
  const mine = myTeamId ? rows.find((r) => r.teamId === myTeamId) : null;
  const mineOutsideTop =
    mine && !top.some((r) => r.teamId === myTeamId) ? mine : null;
  const headerLabel = anyScored ? "POÄNG" : "VÄRDE";

  return (
    <section className="border border-border">
      <header className="flex items-baseline justify-between border-b border-border px-4 py-2 text-[10px] uppercase tracking-widest">
        <span className="text-yellow">
          {anyScored ? "TABELL" : "LAG I LIGAN"}
        </span>
        <span className="text-dim tabular-nums">
          TOPP {Math.min(TOP_N, rows.length)} / {rows.length}
        </span>
      </header>
      <ul className="divide-y divide-border">
        {top.map((row) => (
          <LeagueRow key={row.teamId} row={row} mine={row.teamId === myTeamId} anyScored={anyScored} />
        ))}
        {mineOutsideTop && (
          <>
            <li className="px-4 py-1 text-center text-[10px] uppercase tracking-widest text-dim">
              · · ·
            </li>
            <LeagueRow row={mineOutsideTop} mine anyScored={anyScored} />
          </>
        )}
      </ul>
      <footer className="flex items-baseline justify-between border-t border-border px-4 py-2 text-[10px] uppercase tracking-widest">
        <span className="text-dim">{headerLabel}</span>
        <Link href="/tabell" className="text-cyan hover:underline">
          [ HELA TABELLEN → ]
        </Link>
      </footer>
    </section>
  );
}

function LeagueRow({
  row,
  mine,
  anyScored,
}: {
  row: Awaited<ReturnType<typeof getLeaderboard>>["rows"][number];
  mine: boolean;
  anyScored: boolean;
}) {
  const value = anyScored ? row.totalPointsSek : row.teamValueSek;
  return (
    <li
      className={`grid grid-cols-[2.25rem_1fr_auto] items-baseline gap-3 px-4 py-2 text-sm ${
        mine ? "bg-yellow/10" : ""
      }`}
    >
      <span className="tabular-nums text-yellow font-bold">
        {String(row.rank).padStart(2, "0")}
      </span>
      <Link
        href={`/team/${teamSlug(row.teamName)}`}
        className={`min-w-0 truncate ${
          mine ? "text-yellow" : "text-foreground"
        } hover:text-cyan`}
      >
        {row.teamName}
        <span className="ml-2 text-[10px] uppercase tracking-widest text-dim">
          {row.ownerHandle}
        </span>
      </Link>
      <span className="tabular-nums text-yellow">
        {value === null ? "—" : fmtSek(value)}
      </span>
    </li>
  );
}

function StandingPanel({
  teamSlug: slug,
  rank,
  total,
  lastRoundPoints,
}: {
  teamSlug: string;
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
        <Link href="/tabell" className="text-cyan hover:underline">
          [ HELA TABELLEN ]
        </Link>
        <Link href={`/team/${slug}`} className="text-cyan hover:underline">
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
  droppedPlayers,
  locked,
}: {
  activeRound: { number: number; name: string; deadline: Date | null } | null;
  squadPlayerCount: number;
  droppedPlayers: { id: string; name: string }[];
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

  const hasDropped = !locked && droppedPlayers.length > 0;
  const isReady = squadPlayerCount === 11 && !hasDropped;
  // Dropped picks ALWAYS dominate the panel colour pre-lock — yellow even
  // if the user technically had 11 selected, because they no longer do.
  const tone: "green" | "yellow" | "dim" = locked
    ? "dim"
    : isReady
      ? "green"
      : "yellow";
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
    : hasDropped
      ? "ERSÄTT BORTPLOCKADE"
      : isReady
        ? "DU ÄR KLAR"
        : "INTE KLAR";
  const subline = locked
    ? `Truppen är låst för ${activeRound.name}. Inväntar matcher.`
    : hasDropped
      ? `Aftonbladet har plockat ut ${droppedPlayers.length} av dina spelare ur landslagstruppen — välj ersättare innan deadline. Bytet är gratis innan första ronden startar.`
      : isReady
        ? `Du har valt ${squadPlayerCount} av 11 spelare för ${activeRound.name}. Du kan fortsätta justera tills deadline.`
        : squadPlayerCount === 0
          ? `Du har inte byggt din trupp för ${activeRound.name} än.`
          : `Du har bara valt ${squadPlayerCount} av 11 spelare för ${activeRound.name}.`;

  const ctaLabel = locked
    ? "[ VISA TRUPP ]"
    : hasDropped
      ? "[ ERSÄTT SPELARE → ]"
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

      {hasDropped && (
        <ul className="mt-3 ml-4 list-disc text-xs text-foreground">
          {droppedPlayers.map((d) => (
            <li key={d.id}>{d.name}</li>
          ))}
        </ul>
      )}

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
