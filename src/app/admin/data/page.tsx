import { redirect } from "next/navigation";
import { count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  clubs,
  ingestRuns,
  players,
  playerRoundSnapshots,
  rounds,
} from "@/db/schema";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { isAdmin } from "@/lib/auth";
import { IngestPanel } from "./ingest-panel";

async function getCounts() {
  const [c, p, r, s, inactive] = await Promise.all([
    db.select({ n: count() }).from(clubs),
    db.select({ n: count() }).from(players),
    db.select({ n: count() }).from(rounds),
    db.select({ n: count() }).from(playerRoundSnapshots),
    db.select({ n: count() }).from(players).where(eq(players.active, false)),
  ]);
  return {
    clubs: c[0].n,
    players: p[0].n,
    rounds: r[0].n,
    snapshots: s[0].n,
    inactive: inactive[0].n,
  };
}

export default async function AdminDataPage() {
  if (!(await isAdmin())) redirect("/app");
  const [counts, recentRuns] = await Promise.all([
    getCounts(),
    db
      .select()
      .from(ingestRuns)
      .orderBy(desc(ingestRuns.startedAt))
      .limit(20),
  ]);

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <Breadcrumbs
          trail={[
            { label: "ADMIN", href: "/admin" },
            { label: "DATA" },
          ]}
        />

        <section className="py-6">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-yellow">
            DATA-INGEST
          </h1>
          <p className="mt-2 text-sm text-dim">
            Spelare, klubbar och rondsnapshot. Idag bara mock-data — riktig
            Aftonbladet-källa kopplas in när VM-rulesetet är publicerat.
          </p>
        </section>

        <section className="grid grid-cols-2 gap-0 border border-border sm:grid-cols-5">
          <Stat label="KLUBBAR" value={counts.clubs} />
          <Stat label="SPELARE" value={counts.players} />
          <Stat label="EJ AKTIVA" value={counts.inactive} tone="warn" />
          <Stat label="RONDER" value={counts.rounds} />
          <Stat label="SNAPSHOTS" value={counts.snapshots} />
        </section>

        <IngestPanel />

        <IngestRunsLog runs={recentRuns} />
      </div>
    </main>
  );
}

function IngestRunsLog({
  runs,
}: {
  runs: {
    id: string;
    sourceId: string;
    trigger: string;
    startedAt: Date;
    finishedAt: Date | null;
    ok: boolean;
    summary: Record<string, unknown> | null;
    error: string | null;
  }[];
}) {
  return (
    <section className="mt-10 border border-border">
      <header className="border-b border-border px-4 py-3">
        <p className="text-[10px] uppercase tracking-widest text-dim">
          KÖRHISTORIK
        </p>
        <h2 className="mt-1 text-sm font-bold uppercase tracking-tight text-yellow">
          SENASTE 20 INGEST-KÖRNINGAR
        </h2>
      </header>
      {runs.length === 0 ? (
        <p className="px-4 py-6 text-sm text-dim">
          Inga körningar loggade ännu. Tryck KÖR ovan eller vänta på cron-körning.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {runs.map((r) => {
            const duration =
              r.finishedAt && r.startedAt
                ? `${Math.round(
                    (new Date(r.finishedAt).getTime() -
                      new Date(r.startedAt).getTime()) /
                      1000,
                  )}s`
                : "—";
            const s = r.summary ?? {};
            const summaryBits: string[] = [];
            if (typeof s.snapshotsInserted === "number")
              summaryBits.push(`snap +${s.snapshotsInserted}`);
            if (typeof s.snapshotsUpdated === "number")
              summaryBits.push(`Δ${s.snapshotsUpdated}`);
            if (typeof s.playersInserted === "number" && s.playersInserted > 0)
              summaryBits.push(`p +${s.playersInserted}`);
            if (typeof s.playersArchived === "number" && s.playersArchived > 0)
              summaryBits.push(`arkiv ${s.playersArchived}`);
            if (
              typeof s.squadsInvalidated === "number" &&
              s.squadsInvalidated > 0
            )
              summaryBits.push(`!trupp ${s.squadsInvalidated}`);

            return (
              <li key={r.id} className="px-4 py-3 text-xs">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="tabular-nums text-dim">
                    {new Date(r.startedAt).toISOString().replace("T", " ").slice(0, 19)} UTC
                  </span>
                  <span
                    className={`uppercase tracking-widest ${
                      r.ok ? "text-green" : "text-red"
                    }`}
                  >
                    {r.ok ? "OK" : r.finishedAt ? "FAIL" : "RUNNING"}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-foreground">
                  <span className="text-dim uppercase tracking-widest text-[10px]">
                    {r.trigger}
                  </span>
                  <span className="text-dim">{r.sourceId}</span>
                  <span className="text-dim">{duration}</span>
                  {summaryBits.length > 0 && (
                    <span className="tabular-nums">
                      {summaryBits.join("  ·  ")}
                    </span>
                  )}
                </div>
                {r.error && (
                  <p className="mt-2 break-all border border-red bg-red/10 px-2 py-1 text-red">
                    {r.error}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warn";
}) {
  const valueClass =
    tone === "warn" && value > 0 ? "text-red" : "text-yellow";
  return (
    <div className="border-r border-border p-4 last:border-r-0">
      <p className="text-[10px] uppercase tracking-widest text-dim">{label}</p>
      <p className={`mt-2 text-3xl font-bold tabular-nums ${valueClass}`}>
        {String(value).padStart(3, "0")}
      </p>
    </div>
  );
}
