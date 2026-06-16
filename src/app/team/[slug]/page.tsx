import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { isAdmin } from "@/lib/auth";
import { clubSlug as clubSlugLocal } from "@/lib/clubs";
import { getTeamDetail, type TeamDetailPlayer } from "@/lib/leaderboard";
import { findTeamBySlug } from "@/lib/team-slug.server";

export const dynamic = "force-dynamic";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const team = await findTeamBySlug(slug);
  if (!team) notFound();
  const [{ userId }, admin] = await Promise.all([auth(), isAdmin()]);
  const detail = await getTeamDetail(team.id, {
    viewerUserId: userId,
    viewerIsAdmin: admin,
  });
  if (!detail) notFound();

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <Breadcrumbs
          trail={[
            { label: "TABELL", href: "/tabell" },
            { label: detail.teamName.toUpperCase() },
          ]}
        />

        <section className="py-6">
          <p className="text-[10px] uppercase tracking-widest text-dim">
            ÄGS AV {detail.ownerHandle}
          </p>
          <h1 className="mt-1 text-2xl font-bold uppercase tracking-tight text-yellow sm:text-3xl">
            {detail.teamName}
          </h1>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat
              label="PLACERING"
              value={detail.rank ? `#${detail.rank}` : "—"}
            />
            <Stat
              label="LAGVÄRDE"
              value={
                detail.currentTeamValueSek === null
                  ? "—"
                  : fmtSek(detail.currentTeamValueSek)
              }
              tone="yellow"
            />
            <Stat
              label="SQUAD"
              value={
                detail.currentSquadValueSek === null
                  ? "—"
                  : fmtSek(detail.currentSquadValueSek)
              }
            />
            <Stat
              label="BANK"
              value={
                detail.currentBankSek === null
                  ? "—"
                  : fmtSek(detail.currentBankSek)
              }
              tone={
                detail.currentBankSek !== null && detail.currentBankSek < 0
                  ? "red"
                  : undefined
              }
            />
          </div>
        </section>

        <div className="space-y-6 border-t border-border pt-6">
          {detail.byRound.map((line) => (
            <RoundSection key={line.roundId} line={line} />
          ))}
        </div>
      </div>
    </main>
  );
}

function RoundSection({
  line,
}: {
  line: Awaited<ReturnType<typeof getTeamDetail>> extends infer T
    ? T extends { byRound: infer R }
      ? R extends Array<infer U>
        ? U
        : never
      : never
    : never;
}) {
  const statusColor: Record<string, string> = {
    upcoming: "text-dim",
    open: "text-cyan",
    locked: "text-yellow",
    scored: "text-green",
  };
  const statusLabel: Record<string, string> = {
    upcoming: "KOMMANDE",
    open: "ÖPPEN",
    locked: "LÅST",
    scored: "POÄNGSATT",
  };

  return (
    <section className="border border-border p-4">
      <header className="flex items-baseline justify-between gap-3 text-xs uppercase tracking-widest">
        <span>
          <span className="text-dim">ROND </span>
          <span className="text-yellow tabular-nums">
            {String(line.roundNumber).padStart(2, "0")}
          </span>
          <span className="text-foreground"> — {line.roundName}</span>
        </span>
        <span className={statusColor[line.status]}>
          {statusLabel[line.status]}
        </span>
      </header>

      {line.score && (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px] tabular-nums sm:grid-cols-6">
          <KV k="TILLVÄXT" v={fmtSek(line.score.sumGrowthSek)} />
          <KV k="© BONUS" v={fmtSek(line.score.captainBonusSek)} />
          <KV k="RÄNTA" v={fmtSek(line.score.bankInterestSek)} />
          <KV k="AVGIFT" v={fmtSek(-line.score.transferFeesSek)} />
          <KV
            k="KASSAFLÖDE"
            v={fmtSek(line.score.transferCashFlowSek)}
            tone={line.score.transferCashFlowSek < 0 ? "red" : undefined}
          />
          <KV
            k="Δ VÄRDE"
            v={fmtSek(line.score.totalPointsSek)}
            tone="yellow"
          />
        </dl>
      )}

      {line.hasSquad && line.squadValueSek !== null && (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px] tabular-nums sm:grid-cols-3">
          <KV k="SQUAD" v={fmtSek(line.squadValueSek)} />
          <KV
            k="BANK"
            v={line.bankSek === null ? "—" : fmtSek(line.bankSek)}
            tone={line.bankSek !== null && line.bankSek < 0 ? "red" : undefined}
          />
          <KV
            k="LAGVÄRDE"
            v={line.teamValueSek === null ? "—" : fmtSek(line.teamValueSek)}
            tone="yellow"
          />
        </dl>
      )}

      {/* In-progress round: spell out what BANK is made of (the scored rounds
          show this via the breakdown above; this mirrors it pre-scoring). */}
      {!line.score && line.bankSek !== null && (
        <p className="mt-1 text-[10px] uppercase tracking-widest text-dim">
          BANK = KASSA{" "}
          <span className="text-foreground">
            {fmtSek(
              line.bankSek -
                line.captainBonusProjectedSek -
                line.bankInterestProjectedSek,
            )}
          </span>{" "}
          + RÄNTA{" "}
          <span className="text-foreground">
            {fmtSek(line.bankInterestProjectedSek)}
          </span>{" "}
          + KAPTENBONUS{" "}
          <span className="text-foreground">
            {fmtSek(line.captainBonusProjectedSek)}
          </span>
        </p>
      )}

      {line.squadHidden ? (
        <p className="mt-3 border border-dashed border-yellow/60 p-3 text-[11px] uppercase tracking-widest text-yellow/80">
          🔒 TRUPPEN VISAS NÄR RONDEN HAR LÅSTS
        </p>
      ) : line.hasSquad ? (
        <ul className="mt-4 divide-y divide-dotted divide-border/60 border border-border">
          {line.players.map((p) => (
            <PlayerLine key={p.id} p={p} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-dim">— ingen trupp —</p>
      )}
    </section>
  );
}

function PlayerLine({ p }: { p: TeamDetailPlayer }) {
  const growthColor =
    p.growthSek === null
      ? "text-dim"
      : p.growthSek > 0
        ? "text-green"
        : p.growthSek < 0
          ? "text-red"
          : "text-foreground";
  const arrow =
    p.growthSek === null || p.growthSek === 0
      ? ""
      : p.growthSek > 0
        ? "↑ "
        : "↓ ";
  return (
    <li className="grid grid-cols-[auto_1fr_auto_auto] items-baseline gap-3 p-2 text-xs tabular-nums">
      <span className="text-yellow">{p.position}</span>
      <span className="truncate text-foreground">
        {p.isCaptain && <span className="text-yellow">© </span>}
        <Link href={`/spelare/${p.id}`} className="hover:text-cyan">
          {p.name}
        </Link>{" "}
        <span className="text-dim">
          {p.countryCode ? (
            <Link
              href={`/landslag/${p.countryCode}`}
              className="hover:text-cyan"
            >
              {p.countryCode}
            </Link>
          ) : (
            "—"
          )}
          {p.domesticClub && (
            <>
              {" · "}
              <Link
                href={`/klubblag/${clubSlugLocal(p.domesticClub)}`}
                className="text-cyan/80 hover:text-cyan"
              >
                {p.domesticClub}
              </Link>
            </>
          )}
        </span>
      </span>
      <span className="text-foreground">
        {p.priceSek === null ? "—" : `${(p.priceSek / 1_000_000).toFixed(1)}M`}
      </span>
      <span className={growthColor}>
        {p.growthSek === null ? "" : `${arrow}${fmtSek(p.growthSek)}`}
      </span>
    </li>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "red" | "yellow";
}) {
  const valueClass =
    tone === "red"
      ? "text-red"
      : tone === "yellow"
        ? "text-yellow"
        : "text-foreground";
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-dim">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${valueClass}`}>
        {value}
      </p>
    </div>
  );
}

function KV({
  k,
  v,
  tone,
}: {
  k: string;
  v: string;
  tone?: "yellow" | "red";
}) {
  const valueClass =
    tone === "yellow"
      ? "text-yellow font-bold"
      : tone === "red"
        ? "text-red font-bold"
        : "text-foreground";
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-widest text-dim">{k}</dt>
      <dd className={`mt-0.5 ${valueClass}`}>{v}</dd>
    </div>
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
