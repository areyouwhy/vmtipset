import { redirect } from "next/navigation";
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  clubs,
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
  const counts = await getCounts();

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
      </div>
    </main>
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
