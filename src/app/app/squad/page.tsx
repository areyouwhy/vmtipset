import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { rounds, teams } from "@/db/schema";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { getOrCreateDbUser, isAdmin } from "@/lib/auth";
import {
  getActiveRound,
  getCurrentSquad,
  getLatestSquadForTeam,
  getPickablePlayers,
  getPreviousRoundSquadPlayerIds,
} from "@/lib/squad-data";
import { SquadPicker } from "./picker";

export const dynamic = "force-dynamic";

// TEMPORARY: admin-only dry-run of the transfer phase. Visiting
// /app/squad?preview=<secret> as the admin opens the NEXT round's picker,
// seeded from the latest squad — fully interactive (fees compute live) but
// Save is disabled and nothing is written. Remove this + the preview branch
// below once validated.
const PREVIEW_SECRET = "txnphase-9f3a2c7e";

export default async function SquadPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
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

  // TEMPORARY preview: admin + secret param, only when no round is actually
  // open. Renders the next upcoming round's picker seeded from the latest
  // squad, fully interactive but save-disabled.
  const sp = await searchParams;
  const previewOk =
    !round && sp?.preview === PREVIEW_SECRET && (await isAdmin());
  let previewRound: typeof round = null;
  let previewSeed: Awaited<ReturnType<typeof getLatestSquadForTeam>> = null;
  if (previewOk) {
    const all = await db.select().from(rounds).orderBy(asc(rounds.number));
    previewRound = all.find((r) => r.status === "upcoming") ?? null;
    if (previewRound) previewSeed = await getLatestSquadForTeam(team.id);
  }
  const inPreview = previewOk && previewRound != null && previewSeed != null;

  // Between rounds (no open round) we still let the owner view their current
  // squad — same pitch + lineup, just read-only (no transfers).
  const latest =
    round || inPreview ? null : await getLatestSquadForTeam(team.id);
  const viewRound = round ?? latest?.round ?? null;

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
          {inPreview ? (
            <p className="text-[10px] uppercase tracking-widest text-cyan">
              FÖRHANDSVISNING · {previewRound!.name} (#{previewRound!.number}) ·
              BYTEN SPARAS INTE
            </p>
          ) : round ? (
            <p className="text-[10px] uppercase tracking-widest text-dim">
              <Link
                href={`/vm/omgang/${round.number}`}
                className="text-dim hover:text-cyan"
              >
                AKTIV ROND: {round.name} (#{round.number}) →
              </Link>
            </p>
          ) : viewRound ? (
            <p className="text-[10px] uppercase tracking-widest text-yellow">
              DIN TRUPP · {viewRound.name} (#{viewRound.number}) · LÅST
            </p>
          ) : (
            <p className="text-[10px] uppercase tracking-widest text-dim">
              LAG
            </p>
          )}
          <h1 className="mt-1 text-2xl font-bold uppercase tracking-tight text-yellow">
            {team.name}
          </h1>
          {inPreview && (
            <p className="mt-2 border border-cyan/40 bg-cyan/5 px-3 py-2 text-xs text-cyan">
              Test-läge: byt spelare för att se avgifter (0,7 % av inkommande
              spelares pris) och kassaflöde live. Inget sparas — stäng fliken
              när du är klar.
            </p>
          )}
          {!inPreview && !round && viewRound && (
            <p className="mt-2 text-sm text-dim">
              Inga byten just nu — transfers öppnar när admin öppnar nästa rond.
            </p>
          )}
          {!inPreview && !round && !viewRound && (
            <p className="mt-2 text-sm text-red">
              ! Ingen aktiv rond — admin måste öppna en rond först.
            </p>
          )}
        </section>

        {inPreview && (
          <SquadPickerWrapper
            teamId={team.id}
            roundId={previewRound!.id}
            roundNumber={previewRound!.number}
            deadline={previewRound!.deadline}
            preview
            seedPlayerIds={previewSeed!.squad.playerIds}
            seedCaptainId={previewSeed!.squad.captainPlayerId}
          />
        )}
        {round && (
          <SquadPickerWrapper
            teamId={team.id}
            roundId={round.id}
            roundNumber={round.number}
            deadline={round.deadline}
          />
        )}
        {!round && viewRound && (
          <SquadPickerWrapper
            teamId={team.id}
            roundId={viewRound.id}
            roundNumber={viewRound.number}
            deadline={viewRound.deadline}
            readOnly
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
  deadline,
  readOnly = false,
  preview = false,
  seedPlayerIds,
  seedCaptainId,
}: {
  teamId: string;
  roundId: string;
  roundNumber: number;
  deadline: Date | null;
  readOnly?: boolean;
  /** TEMPORARY preview mode — editable, fees compute live, Save disabled. */
  preview?: boolean;
  /** Initial squad for preview (the carried-forward squad). */
  seedPlayerIds?: string[];
  seedCaptainId?: string | null;
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

  // In preview, seed from the carried-forward squad and diff transfers against
  // it (so swaps show fees), rather than the empty not-yet-created round squad.
  const baseIds = preview ? (seedPlayerIds ?? []) : cleanIds;
  const baseCaptainId = preview ? (seedCaptainId ?? null) : cleanCaptainId;
  const referenceForDiff = preview ? (seedPlayerIds ?? null) : referenceIds;

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
        initialPlayerIds={baseIds}
        initialCaptainId={baseCaptainId}
        locked={!preview && (readOnly || current?.lockedAt != null)}
        referencePlayerIds={referenceForDiff}
        preview={preview}
        deadlineSlot={
          readOnly || preview ? null : <DeadlineBanner deadline={deadline} />
        }
      />
    </>
  );
}
