import { redirect } from "next/navigation";
import { count } from "drizzle-orm";
import { db } from "@/db";
import {
  clubs,
  players,
  playerRoundSnapshots,
  rounds,
} from "@/db/schema";
import { isAdmin } from "@/lib/auth";
import { IngestPanel } from "./ingest-panel";

async function getCounts() {
  const [c, p, r, s] = await Promise.all([
    db.select({ n: count() }).from(clubs),
    db.select({ n: count() }).from(players),
    db.select({ n: count() }).from(rounds),
    db.select({ n: count() }).from(playerRoundSnapshots),
  ]);
  return {
    clubs: c[0].n,
    players: p[0].n,
    rounds: r[0].n,
    snapshots: s[0].n,
  };
}

export default async function AdminDataPage() {
  if (!(await isAdmin())) redirect("/app");
  const counts = await getCounts();

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <header className="flex items-center justify-between border-b border-border pb-3 text-xs uppercase tracking-widest">
          <span className="text-yellow">COPA / ADMIN / DATA</span>
          <a href="/admin" className="text-cyan">
            ← ADMIN
          </a>
        </header>

        <section className="py-6">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-yellow">
            DATA-INGEST
          </h1>
          <p className="mt-2 text-sm text-dim">
            Spelare, klubbar och rondsnapshot. Idag bara mock-data — riktig
            Aftonbladet-källa kopplas in när VM-rulesetet är publicerat.
          </p>
        </section>

        <section className="grid grid-cols-2 gap-0 border border-border sm:grid-cols-4">
          <Stat label="KLUBBAR" value={counts.clubs} />
          <Stat label="SPELARE" value={counts.players} />
          <Stat label="RONDER" value={counts.rounds} />
          <Stat label="SNAPSHOTS" value={counts.snapshots} />
        </section>

        <IngestPanel />
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-r border-border p-4 last:border-r-0">
      <p className="text-[10px] uppercase tracking-widest text-dim">{label}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-yellow">
        {String(value).padStart(3, "0")}
      </p>
    </div>
  );
}
