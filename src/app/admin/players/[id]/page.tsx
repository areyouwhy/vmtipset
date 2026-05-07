import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  clubs,
  playerRoundSnapshots,
  players,
  rounds,
} from "@/db/schema";
import { isAdmin } from "@/lib/auth";
import { SnapshotEditor } from "./snapshot-editor";

export const dynamic = "force-dynamic";

export default async function PlayerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await isAdmin())) redirect("/app");
  const { id } = await params;

  const [player] = await db
    .select()
    .from(players)
    .where(eq(players.id, id))
    .limit(1);
  if (!player) notFound();

  const [allRounds, allSnapshots, club] = await Promise.all([
    db.select().from(rounds).orderBy(asc(rounds.number)),
    db
      .select()
      .from(playerRoundSnapshots)
      .where(eq(playerRoundSnapshots.playerId, id)),
    player.clubId
      ? db
          .select()
          .from(clubs)
          .where(eq(clubs.id, player.clubId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : null,
  ]);

  // Per round: { api, manual }
  const byRound = new Map<
    string,
    { api?: typeof allSnapshots[number]; manual?: typeof allSnapshots[number] }
  >();
  for (const s of allSnapshots) {
    const cur = byRound.get(s.roundId) ?? {};
    if (s.source === "api") cur.api = s;
    else cur.manual = s;
    byRound.set(s.roundId, cur);
  }

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <header className="flex items-center justify-between border-b border-border pb-3 text-xs uppercase tracking-widest">
          <span className="text-yellow">COPA / ADMIN / SPELARE</span>
          <Link href="/admin/players" className="text-cyan">
            ← ALLA SPELARE
          </Link>
        </header>

        <section className="py-6">
          <p className="text-[10px] uppercase tracking-widest text-dim">
            {player.position} · {club?.shortName ?? club?.name ?? "—"} ·{" "}
            {club?.countryCode ?? "—"}
          </p>
          <h1 className="mt-1 text-2xl font-bold uppercase tracking-tight text-yellow">
            {player.name}
          </h1>
          <p className="mt-2 text-xs text-dim">
            External id: <span className="text-foreground">{player.externalId ?? "—"}</span>
          </p>
        </section>

        <section className="space-y-6">
          {allRounds.map((r) => (
            <RoundSnapshotBlock
              key={r.id}
              roundId={r.id}
              roundNumber={r.number}
              roundName={r.name}
              api={byRound.get(r.id)?.api ?? null}
              manual={byRound.get(r.id)?.manual ?? null}
              playerId={player.id}
            />
          ))}
        </section>
      </div>
    </main>
  );
}

function RoundSnapshotBlock({
  roundId,
  roundNumber,
  roundName,
  api,
  manual,
  playerId,
}: {
  roundId: string;
  roundNumber: number;
  roundName: string;
  api: { priceSek: number; growthSek: number; capturedAt: Date } | null;
  manual: {
    id: string;
    priceSek: number;
    growthSek: number;
    notes: string | null;
    capturedAt: Date;
  } | null;
  playerId: string;
}) {
  return (
    <article className="border border-border p-4">
      <header className="flex items-baseline justify-between gap-3 text-xs uppercase tracking-widest">
        <span>
          <span className="text-dim">ROND </span>
          <span className="text-yellow tabular-nums">
            {String(roundNumber).padStart(2, "0")}
          </span>
          <span className="text-foreground"> — {roundName}</span>
        </span>
        <span
          className={
            manual
              ? "text-yellow"
              : api
                ? "text-cyan"
                : "text-dim"
          }
        >
          {manual ? "MANUAL" : api ? "API" : "INGEN"}
        </span>
      </header>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px] tabular-nums sm:grid-cols-4">
        <KV
          k="API PRIS"
          v={api ? `${(api.priceSek / 1_000_000).toFixed(2)}M` : "—"}
        />
        <KV
          k="API TILLVÄXT"
          v={api ? fmtSek(api.growthSek) : "—"}
        />
        <KV
          k="MANUAL PRIS"
          v={manual ? `${(manual.priceSek / 1_000_000).toFixed(2)}M` : "—"}
          tone={manual ? "yellow" : "dim"}
        />
        <KV
          k="MANUAL TILLVÄXT"
          v={manual ? fmtSek(manual.growthSek) : "—"}
          tone={manual ? "yellow" : "dim"}
        />
      </dl>

      <SnapshotEditor
        playerId={playerId}
        roundId={roundId}
        defaults={
          manual
            ? {
                priceSek: manual.priceSek,
                growthSek: manual.growthSek,
                notes: manual.notes ?? "",
              }
            : api
              ? {
                  priceSek: api.priceSek,
                  growthSek: api.growthSek,
                  notes: "",
                }
              : { priceSek: 0, growthSek: 0, notes: "" }
        }
        hasManual={manual !== null}
      />
    </article>
  );
}

function KV({
  k,
  v,
  tone,
}: {
  k: string;
  v: string;
  tone?: "yellow" | "dim";
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-widest text-dim">{k}</dt>
      <dd
        className={
          tone === "yellow"
            ? "text-yellow"
            : tone === "dim"
              ? "text-dim"
              : "text-foreground"
        }
      >
        {v}
      </dd>
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
