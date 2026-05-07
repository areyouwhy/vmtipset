import type { Team } from "@/db/schema";
import { SWISH_AMOUNT_SEK, SWISH_PHONE } from "@/lib/swish";

export function PendingPanel({ team, email }: { team: Team; email: string }) {
  const qrUrl = `/api/swish-qr?msg=${encodeURIComponent(email)}`;

  return (
    <section className="border border-yellow p-5">
      <p className="text-[10px] uppercase tracking-widest text-yellow">
        STATUS / VÄNTAR PÅ GODKÄNNANDE
      </p>
      <h2 className="mt-2 text-xl font-bold uppercase tracking-tight text-foreground">
        BETALNING KRÄVS
      </h2>
      <p className="mt-3 text-sm text-dim">
        Lag <span className="text-yellow">{team.name}</span> är registrerat.
        Betala insatsen för att bli godkänd.
      </p>

      <div className="mt-6 grid gap-5 sm:grid-cols-[auto_1fr] sm:items-start">
        <div className="border border-border bg-white p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUrl} alt="Swish QR" width={200} height={200} />
        </div>

        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-[10px] uppercase tracking-widest text-dim">
              BELOPP
            </dt>
            <dd className="mt-0.5 text-2xl font-bold tabular-nums text-yellow">
              {SWISH_AMOUNT_SEK} KR
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-widest text-dim">
              SWISH-NUMMER
            </dt>
            <dd className="mt-0.5 tabular-nums text-foreground">
              {SWISH_PHONE}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-widest text-dim">
              MEDDELANDE / AUTO
            </dt>
            <dd className="mt-0.5 break-all text-foreground">{email}</dd>
          </div>
        </dl>
      </div>

      <p className="mt-6 border-t border-border pt-4 text-xs text-dim">
        SKANNA QR · TELEFON, BELOPP OCH MEDDELANDE FYLLS I AUTOMATISKT.
        <br />
        EFTER BETALNING: ADMIN GODKÄNNER MANUELLT.
      </p>
    </section>
  );
}
