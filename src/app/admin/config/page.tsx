import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import {
  ensureDefaultPrizes,
  getPotPayout,
  loadPrizePools,
} from "@/lib/prize-config";
import { bpsToPercent, formatSek } from "@/lib/prizes";
import { currentRules } from "@/lib/rules";
import { PoolAllocationsForm } from "./pool-allocations-form";
import { PlacesEditor } from "./places-editor";

export default async function AdminConfigPage() {
  if (!(await isAdmin())) redirect("/app");

  await ensureDefaultPrizes();
  const [pools, payout] = await Promise.all([loadPrizePools(), getPotPayout()]);

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <header className="flex items-center justify-between border-b border-border pb-3 text-xs uppercase tracking-widest">
          <span className="text-yellow">COPA / ADMIN / CONFIG</span>
          <a href="/admin" className="text-cyan">
            ← ADMIN
          </a>
        </header>

        <section className="py-6">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-yellow">
            POTT &amp; PRIS
          </h1>
          <p className="mt-2 text-sm text-dim">
            Total pott räknas ut på antal{" "}
            <span className="text-foreground">godkända</span> deltagare ×{" "}
            {currentRules.stakePerUserSek} kr.
          </p>
        </section>

        {/* Pot preview */}
        <section className="border border-border p-5">
          <p className="text-[10px] uppercase tracking-widest text-dim">
            POTT-FÖRHANDSVISNING
          </p>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Stat label="GODKÄNDA" value={`${payout.approvedCount}`} />
            <Stat label="INSATS" value={`${payout.stakeSek} KR`} />
            <Stat
              label="TOTAL POTT"
              value={`${formatSek(payout.totalPotSek)} KR`}
              big
            />
          </div>

          <div className="mt-5 space-y-4">
            {payout.pools.map((pool) => (
              <div key={pool.key} className="border border-border p-4">
                <div className="flex items-baseline justify-between">
                  <p className="text-xs uppercase tracking-widest text-yellow">
                    {pool.label}
                  </p>
                  <p className="text-xs text-dim">
                    <span className="text-foreground">
                      {bpsToPercent(pool.allocationBps)}
                    </span>{" "}
                    ·{" "}
                    <span className="text-foreground">
                      {formatSek(pool.poolAmountSek)} KR
                    </span>
                  </p>
                </div>
                {pool.places.length === 0 ? (
                  <p className="mt-2 text-xs text-dim">— inga platser —</p>
                ) : (
                  <ul className="mt-3 divide-y divide-dotted divide-border/60 text-sm tabular-nums">
                    {pool.places.map((p) => (
                      <li
                        key={p.place}
                        className="flex items-baseline justify-between py-1"
                      >
                        <span className="text-dim">PLATS {p.place}</span>
                        <span>
                          <span className="text-yellow">
                            {bpsToPercent(p.shareBps)}
                          </span>
                          <span className="ml-3 text-foreground">
                            {formatSek(p.amountSek)} KR
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {pool.remainderSek > 0 && (
                  <p className="mt-2 text-xs text-red">
                    AVRUNDNINGSREST: {pool.remainderSek} KR
                  </p>
                )}
              </div>
            ))}
            {payout.remainderSek > 0 && (
              <p className="text-xs text-red">
                POTT-REST: {payout.remainderSek} KR (avrundning vid
                pottfördelning)
              </p>
            )}
          </div>
        </section>

        {/* Pool allocations form */}
        <section className="mt-8">
          <PoolAllocationsForm pools={pools} />
        </section>

        {/* Places editors per pool */}
        {pools.map((pool) => (
          <section key={pool.key} className="mt-8">
            <PlacesEditor
              poolKey={pool.key}
              poolLabel={pool.label}
              initialPlaces={pool.places.map((p) => ({
                place: p.place,
                sharePct: p.shareBps / 100,
              }))}
            />
          </section>
        ))}
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  big,
}: {
  label: string;
  value: string;
  big?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-dim">{label}</p>
      <p
        className={`mt-1 font-bold tabular-nums text-yellow ${big ? "text-2xl sm:text-3xl" : "text-xl"}`}
      >
        {value}
      </p>
    </div>
  );
}
