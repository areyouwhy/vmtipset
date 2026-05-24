import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { teams } from "@/db/schema";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { getOrCreateDbUser } from "@/lib/auth";
import {
  getActiveRound,
  getCurrentSquad,
  getPickablePlayers,
  getPreviousRoundSquadPlayerIds,
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
      <div className="mx-auto w-full max-w-3xl lg:max-w-6xl">
        <Breadcrumbs
          trail={[
            { label: "APP", href: "/app" },
            { label: "TRUPP" },
          ]}
        />

        <section className="py-6">
          <p className="text-[10px] uppercase tracking-widest text-dim">
            LAG
          </p>
          <h1 className="mt-1 text-2xl font-bold uppercase tracking-tight text-yellow">
            {team.name}
          </h1>
          {round ? (
            <>
              <p className="mt-2 text-sm text-dim">
                Aktiv rond:{" "}
                <Link
                  href={`/vm/omgang/${round.number}`}
                  className="text-foreground hover:text-cyan"
                >
                  {round.name} (#{round.number}) →
                </Link>
              </p>
              <DeadlineBanner deadline={round.deadline} />
            </>
          ) : (
            <p className="mt-2 text-sm text-red">
              ! Ingen aktiv rond — admin måste öppna en rond först.
            </p>
          )}
        </section>

        {round && (
          <SquadPickerWrapper
            teamId={team.id}
            roundId={round.id}
            roundNumber={round.number}
          />
        )}
      </div>
    </main>
  );
}

function DeadlineBanner({ deadline }: { deadline: Date | null }) {
  if (!deadline) return null;
  // Server-rendered "now" — fine here, the value is captured at render time
  // and re-rendered on each request because the page is force-dynamic.
  // eslint-disable-next-line react-hooks/purity
  const ms = new Date(deadline).getTime() - Date.now();
  const isPast = ms < 0;
  if (isPast) {
    return (
      <p className="mt-2 border border-red bg-red/10 px-3 py-2 text-xs uppercase tracking-widest text-red">
        ! DEADLINE PASSERAD ·{" "}
        {new Date(deadline).toISOString().slice(0, 16).replace("T", " ")} UTC
      </p>
    );
  }
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const tone = days < 1 ? "yellow" : "cyan";
  const colorClass = tone === "yellow" ? "text-yellow border-yellow/40 bg-yellow/5" : "text-cyan border-cyan/30 bg-cyan/5";
  return (
    <p
      className={`mt-2 border px-3 py-2 text-xs uppercase tracking-widest ${colorClass}`}
    >
      DEADLINE{" "}
      <span className="text-foreground">
        {new Date(deadline).toISOString().slice(0, 16).replace("T", " ")} UTC
      </span>
      <span className="ml-2 tabular-nums">
        ·{" "}
        {days > 0
          ? `${days}d ${hours}h kvar`
          : hours > 0
            ? `${hours}h ${mins}m kvar`
            : `${mins}m kvar`}
      </span>
    </p>
  );
}

async function SquadPickerWrapper({
  teamId,
  roundId,
  roundNumber,
}: {
  teamId: string;
  roundId: string;
  roundNumber: number;
}) {
  const [pickable, current, referenceIds] = await Promise.all([
    getPickablePlayers(roundId),
    getCurrentSquad(teamId, roundId),
    getPreviousRoundSquadPlayerIds(teamId, roundNumber),
  ]);

  if (pickable.length === 0) {
    return (
      <p className="border border-red bg-red/10 px-3 py-2 text-sm text-red">
        ! Inga spelare med snapshot för aktiv rond. Kör mock-ingest från
        /admin/data först.
      </p>
    );
  }

  // Strip dropped players from the initial selection so the picker's
  // counters and pitch reflect reality. The IDs still exist in the DB —
  // only the visual squad state is corrected. The user re-picks; on save
  // the squad_players rows are rewritten anyway.
  const dropped = current?.droppedPlayers ?? [];
  const droppedIds = new Set(dropped.map((d) => d.id));
  const cleanIds = (current?.playerIds ?? []).filter(
    (id) => !droppedIds.has(id),
  );
  const cleanCaptainId =
    current?.captainPlayerId && droppedIds.has(current.captainPlayerId)
      ? null
      : (current?.captainPlayerId ?? null);

  return (
    <>
      {(dropped.length > 0 || current?.invalid) && current?.lockedAt == null && (
        <section
          className={`mt-3 border p-3 text-xs ${
            current?.invalid
              ? "border-red bg-red/5"
              : "border-yellow bg-yellow/5"
          }`}
        >
          <p
            className={`uppercase tracking-widest ${
              current?.invalid ? "text-red" : "text-yellow"
            }`}
          >
            {current?.invalid
              ? "! TRUPPEN ÄR OGILTIG — MÅSTE BYGGAS OM"
              : `! AFTONBLADET HAR PLOCKAT UT ${dropped.length} SPELARE`}
          </p>
          {current?.invalidReason && (
            <p className="mt-2 text-foreground">{current.invalidReason}</p>
          )}
          {dropped.length > 0 && (
            <ul className="mt-2 ml-3 list-disc text-foreground">
              {dropped.map((d) => (
                <li key={d.id}>{d.name}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-dim">
            {dropped.length === 1 ? "Spelaren är" : "Spelarna är"} borttagna
            ur landslagstruppen. Välj ersättare — bytet kostar inget innan
            första ronden startar.
          </p>
        </section>
      )}
      <SquadPicker
        players={pickable}
        initialPlayerIds={cleanIds}
        initialCaptainId={cleanCaptainId}
        locked={current?.lockedAt != null}
        referencePlayerIds={referenceIds}
      />
    </>
  );
}
