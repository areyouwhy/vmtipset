import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { isAdmin } from "@/lib/auth";
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
            <Stat label="TOTAL" value={fmtSek(detail.totalPointsSek)} />
            <Stat
              label="LAGVÄRDE"
              value={
                detail.currentTeamValueSek === null
                  ? "—"
                  : fmtSek(detail.currentTeamValueSek)
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
        <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px] tabular-nums sm:grid-cols-5">
          <KV k="TILLVÄXT" v={fmtSek(line.score.sumGrowthSek)} />
          <KV k="© BONUS" v={fmtSek(line.score.captainBonusSek)} />
          <KV k="BANK" v={fmtSek(line.score.bankInterestSek)} />
          <KV k="AVGIFT" v={fmtSek(-line.score.transferFeesSek)} />
          <KV
            k="TOTAL"
            v={fmtSek(line.score.totalPointsSek)}
            tone="yellow"
          />
        </dl>
      )}

      {line.hasSquad && line.teamValueSek !== null && (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px] tabular-nums sm:grid-cols-2">
          <KV k="LAGVÄRDE" v={fmtSek(line.teamValueSek)} />
          <KV
            k="BANK / OANVÄNT"
            v={line.unusedSek === null ? "—" : fmtSek(line.unusedSek)}
            tone={
              line.unusedSek !== null && line.unusedSek < 0
                ? "red"
                : undefined
            }
          />
        </dl>
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
  return (
    <li className="grid grid-cols-[auto_1fr_auto_auto] items-baseline gap-3 p-2 text-xs tabular-nums">
      <span className="text-yellow">{p.position}</span>
      <span className="truncate text-foreground">
        {p.isCaptain && <span className="text-yellow">© </span>}
        {p.name}{" "}
        <span className="text-dim">
          {p.countryCode ?? "—"} · {p.clubShortName}
        </span>
      </span>
      <span className="text-foreground">
        {p.priceSek === null ? "—" : `${(p.priceSek / 1_000_000).toFixed(1)}M`}
      </span>
      <span className={growthColor}>
        {p.growthSek === null ? "" : fmtSek(p.growthSek)}
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
  tone?: "red";
}) {
  const valueClass = tone === "red" ? "text-red" : "text-yellow";
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
