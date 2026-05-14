"use client";

import { useState, useTransition } from "react";
import type { IngestSummary } from "@/lib/ingest-apply";
import { runIngestAction, wipeAndReingestAction } from "./actions";

export function IngestPanel() {
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<IngestSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<IngestSummary>) {
    setError(null);
    startTransition(async () => {
      try {
        setSummary(await fn());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Okänt fel");
      }
    });
  }

  function wipeConfirmed(source: "mock" | "aftonbladet") {
    const label =
      source === "aftonbladet"
        ? "Aftonbladet VM 2026 (LIVE)"
        : "mock-datasetet";
    if (
      !confirm(
        `RENSA OCH INGEST FRÅN ${label.toUpperCase()}?\n\nAlla klubbar, spelare, ronder, snapshots, trupper, byten och poäng raderas innan ny data läses in.`,
      )
    )
      return;
    run(() => wipeAndReingestAction(source));
  }

  return (
    <section className="mt-8 space-y-4">
      <Block
        title="MOCK-KÄLLA"
        body="8 klubbar, 80 spelare, 2 ronder. Idempotent. Bra för test."
        primaryLabel="[ KÖR MOCK INGEST → ]"
        primaryTone="yellow"
        onPrimary={() => run(() => runIngestAction("mock"))}
        wipeLabel="[ ! RENSA & RE-INGEST MOCK ]"
        onWipe={() => wipeConfirmed("mock")}
        pending={pending}
      />

      <Block
        title="AFTONBLADET (LIVE)"
        body="Riktig VM 2026-data via api-manager.aftonbladet.se (spel 735). 48 nationer, ~1300 spelare och alla rondsnapshots. Kan ta 30-60 sek. Cron uppdaterar varje timme."
        primaryLabel="[ KÖR AFTONBLADET INGEST → ]"
        primaryTone="cyan"
        onPrimary={() => run(() => runIngestAction("aftonbladet"))}
        wipeLabel="[ ! RENSA & RE-INGEST VM ]"
        onWipe={() => wipeConfirmed("aftonbladet")}
        pending={pending}
      />

      {error && (
        <p className="border border-red bg-red/10 px-3 py-2 text-sm text-red">
          ! {error}
        </p>
      )}

      {summary && (
        <section className="border border-border p-5">
          <p className="text-[10px] uppercase tracking-widest text-dim">
            SENASTE KÖRNING
          </p>
          <dl className="mt-3 space-y-1 text-xs">
            <Line k="KÄLLA" v={summary.sourceId} />
            <Line k="KLUBBAR INSERT" v={summary.clubsInserted} />
            <Line k="KLUBBAR UPDATE" v={summary.clubsUpdated} />
            <Line k="SPELARE INSERT" v={summary.playersInserted} />
            <Line k="SPELARE UPDATE" v={summary.playersUpdated} />
            <Line k="RONDER INSERT" v={summary.roundsInserted} />
            <Line k="RONDER UPDATE" v={summary.roundsUpdated} />
            <Line k="SNAPSHOTS INSERT" v={summary.snapshotsInserted} />
            <Line k="SNAPSHOTS UPDATE" v={summary.snapshotsUpdated} />
            <Line
              k="ORFNARS"
              v={
                summary.orphanedPlayers.length === 0
                  ? "—"
                  : `${summary.orphanedPlayers.length} st`
              }
              tone={summary.orphanedPlayers.length > 0 ? "warn" : undefined}
            />
            <Line
              k="DEAKTIVERADE"
              v={summary.playersDeactivated}
              tone={summary.playersDeactivated > 0 ? "warn" : undefined}
            />
          </dl>
        </section>
      )}
    </section>
  );
}

function Block({
  title,
  body,
  primaryLabel,
  primaryTone,
  onPrimary,
  wipeLabel,
  onWipe,
  pending,
}: {
  title: string;
  body: string;
  primaryLabel: string;
  primaryTone: "yellow" | "cyan";
  onPrimary: () => void;
  wipeLabel: string;
  onWipe: () => void;
  pending: boolean;
}) {
  const primaryClass =
    primaryTone === "yellow"
      ? "border-yellow bg-yellow text-black"
      : "border-cyan bg-cyan text-black";
  return (
    <div className="border border-border p-5">
      <p className="text-[10px] uppercase tracking-widest text-dim">
        KÄLLA
      </p>
      <h2 className="mt-1 text-lg font-bold uppercase tracking-tight text-yellow">
        {title}
      </h2>
      <p className="mt-2 text-sm text-dim">{body}</p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          disabled={pending}
          onClick={onPrimary}
          className={`${primaryClass} border px-6 py-3 text-sm font-bold uppercase tracking-widest transition hover:opacity-90 disabled:opacity-40 sm:w-auto`}
        >
          {pending ? "[ KÖR... ]" : primaryLabel}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onWipe}
          className="border border-red px-6 py-3 text-sm font-bold uppercase tracking-widest text-red transition hover:bg-red hover:text-black disabled:opacity-40 sm:w-auto"
        >
          {pending ? "[ KÖR... ]" : wipeLabel}
        </button>
      </div>
    </div>
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
