import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { teams } from "@/db/schema";
import { getOrCreateDbUser } from "@/lib/auth";
import {
  getActiveRound,
  getCurrentSquad,
  getPickablePlayers,
} from "@/lib/squad-data";
import { SquadPicker } from "./picker";

export const dynamic = "force-dynamic";

export default async function SquadPage() {
  const user = await getOrCreateDbUser();
  if (!user) redirect("/");
  if (user.status !== "approved") redirect("/app");

  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.ownerUserId, user.id))
    .limit(1);
  if (!team) redirect("/app");

  const round = await getActiveRound();

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <header className="flex items-center justify-between border-b border-border pb-3 text-xs uppercase tracking-widest">
          <span className="text-yellow">COPA / TRUPP</span>
          <Link href="/app" className="text-cyan">
            ← APP
          </Link>
        </header>

        <section className="py-6">
          <p className="text-[10px] uppercase tracking-widest text-dim">
            LAG
          </p>
          <h1 className="mt-1 text-2xl font-bold uppercase tracking-tight text-yellow">
            {team.name}
          </h1>
          {round ? (
            <p className="mt-2 text-sm text-dim">
              Aktiv rond:{" "}
              <span className="text-foreground">
                {round.name} (#{round.number})
              </span>
            </p>
          ) : (
            <p className="mt-2 text-sm text-red">
              ! Ingen aktiv rond — admin måste öppna en rond först.
            </p>
          )}
        </section>

        {round && (
          <SquadPickerWrapper teamId={team.id} roundId={round.id} />
        )}
      </div>
    </main>
  );
}

async function SquadPickerWrapper({
  teamId,
  roundId,
}: {
  teamId: string;
  roundId: string;
}) {
  const [pickable, current] = await Promise.all([
    getPickablePlayers(roundId),
    getCurrentSquad(teamId, roundId),
  ]);

  if (pickable.length === 0) {
    return (
      <p className="border border-red bg-red/10 px-3 py-2 text-sm text-red">
        ! Inga spelare med snapshot för aktiv rond. Kör mock-ingest från
        /admin/data först.
      </p>
    );
  }

  return (
    <SquadPicker
      players={pickable}
      initialPlayerIds={current?.playerIds ?? []}
      initialCaptainId={current?.captainPlayerId ?? null}
      locked={current?.lockedAt != null}
    />
  );
}
