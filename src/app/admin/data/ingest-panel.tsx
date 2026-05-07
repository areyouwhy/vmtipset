"use client";

import { useState, useTransition } from "react";
import type { IngestSummary } from "@/lib/ingest-apply";
import { runMockIngestAction, wipeAndReingestAction } from "./actions";

export function IngestPanel() {
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<IngestSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="mt-8 border border-border p-5">
      <p className="text-[10px] uppercase tracking-widest text-dim">
        KÖR INGEST
      </p>
      <h2 className="mt-2 text-xl font-bold uppercase tracking-tight text-yellow">
        MOCK-KÄLLA
      </h2>
      <p className="mt-2 text-sm text-dim">
        Mock-datasetet: 8 klubbar, 80 spelare, 2 ronder. Idempotent — andra
        körningen ska inte ge några nya rader.
      </p>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              try {
                const result = await runMockIngestAction();
                setSummary(result);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Okänt fel");
              }
            })
          }
          className="border border-yellow bg-yellow px-6 py-3 text-sm font-bold uppercase tracking-widest text-black transition hover:opacity-90 disabled:opacity-40 sm:w-auto"
        >
          {pending ? "[ KÖR... ]" : "[ KÖR MOCK INGEST → ]"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (
              !confirm(
                "RENSA OCH RE-INGEST?\n\nDetta tar bort alla klubbar, spelare, ronder, snapshots, trupper och byten. Bara mock-datat återstår.",
              )
            )
              return;
            startTransition(async () => {
              setError(null);
              try {
                const result = await wipeAndReingestAction();
                setSummary(result);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Okänt fel");
              }
            });
          }}
          className="border border-red px-6 py-3 text-sm font-bold uppercase tracking-widest text-red transition hover:bg-red hover:text-black disabled:opacity-40 sm:w-auto"
        >
          {pending ? "[ KÖR... ]" : "[ ! RENSA & RE-INGEST ]"}
        </button>
      </div>

      {error && (
        <p className="mt-4 border border-red bg-red/10 px-3 py-2 text-sm text-red">
          ! {error}
        </p>
      )}

      {summary && (
        <dl className="mt-6 space-y-1 text-xs">
          <Line k="KÄLLA" v={summary.sourceId} />
          <Line k="KLUBBAR INSERT" v={summary.clubsInserted} />
          <Line k="KLUBBAR UPDATE" v={summary.clubsUpdated} />
          <Line k="SPELARE INSERT" v={summary.playersInserted} />
          <Line k="SPELARE UPDATE" v={summary.playersUpdated} />
          <Line k="RONDER INSERT" v={summary.roundsInserted} />
          <Line k="RONDER UPDATE" v={summary.roundsUpdated} />
          <Line k="SNAPSHOTS INSERT" v={summary.snapshotsInserted} />
          <Line
            k="ORFNARS"
            v={
              summary.orphanedPlayers.length === 0
                ? "—"
                : summary.orphanedPlayers.join(", ")
            }
            tone={summary.orphanedPlayers.length > 0 ? "warn" : undefined}
          />
        </dl>
      )}
    </section>
  );
}

function Line({
  k,
  v,
  tone,
}: {
  k: string;
  v: string | number;
  tone?: "warn";
}) {
  const valueClass = tone === "warn" ? "text-yellow" : "text-foreground";
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dotted border-border/60 py-1">
      <dt className="text-[11px] uppercase tracking-widest text-dim">{k}</dt>
      <dd className={`tabular-nums ${valueClass}`}>{v}</dd>
    </div>
  );
}
