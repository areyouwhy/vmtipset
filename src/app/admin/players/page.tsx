import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  clubs,
  playerRoundSnapshots,
  players,
  rounds,
} from "@/db/schema";
import { isAdmin } from "@/lib/auth";
import { PlayerListClient } from "./list-client";

export const dynamic = "force-dynamic";

export default async function AdminPlayersPage() {
  if (!(await isAdmin())) redirect("/app");

  const [allPlayers, allClubs, allRounds, allSnapshots] = await Promise.all([
    db
      .select()
      .from(players)
      .where(eq(players.active, true))
      .orderBy(asc(players.name)),
    db.select().from(clubs),
    db.select().from(rounds).orderBy(asc(rounds.number)),
    db.select().from(playerRoundSnapshots),
  ]);

  const baseRoundId = allRounds[0]?.id;
  const clubById = new Map(allClubs.map((c) => [c.id, c]));

  const baselinePriceById = new Map<string, number>();
  if (baseRoundId) {
    for (const s of allSnapshots) {
      if (s.roundId !== baseRoundId) continue;
      const prev = baselinePriceById.get(s.playerId);
      if (prev === undefined || s.source === "manual") {
        baselinePriceById.set(s.playerId, s.priceSek);
      }
    }
  }

  const manualCountByPlayer = new Map<string, number>();
  for (const s of allSnapshots) {
    if (s.source === "manual") {
      manualCountByPlayer.set(
        s.playerId,
        (manualCountByPlayer.get(s.playerId) ?? 0) + 1,
      );
    }
  }

  const rows = allPlayers.map((p) => {
    const club = p.clubId ? clubById.get(p.clubId) : null;
    return {
      id: p.id,
      name: p.name,
      position: p.position,
      countryCode: club?.countryCode ?? null,
      clubShortName: club?.shortName ?? club?.name ?? "—",
      basePriceSek: baselinePriceById.get(p.id) ?? null,
      manualOverrides: manualCountByPlayer.get(p.id) ?? 0,
    };
  });

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <header className="flex items-center justify-between border-b border-border pb-3 text-xs uppercase tracking-widest">
          <span className="text-yellow">COPA / ADMIN / SPELARE</span>
          <Link href="/admin" className="text-cyan">
            ← ADMIN
          </Link>
        </header>

        <section className="py-6">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-yellow">
            SPELARE
          </h1>
          <p className="mt-2 text-sm text-dim">
            Klicka på en spelare för att se snapshot per rond eller skriva
            över värden manuellt. Manuella ändringar markeras med{" "}
            <span className="text-yellow">M</span> och vinner över API-data
            vid poängräkning.
          </p>
        </section>

        <PlayerListClient rows={rows} />
      </div>
    </main>
  );
}
