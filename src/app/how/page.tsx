import Link from "next/link";
import {
  currentRules,
  formationToString,
  type Formation,
} from "@/lib/rules";
import { ensureDefaultPrizes, getPotPayout } from "@/lib/prize-config";
import { bpsToPercent } from "@/lib/prizes";

export const metadata = {
  title: "HOW — Copa del Mundo 2026",
  description:
    "How the league works, what the rules are, and how scoring is calculated.",
};

// The pot preview reads the live approved-user count + pool config; never
// prerender against build-time DB state.
export const dynamic = "force-dynamic";

export default async function HowPage() {
  const r = currentRules;
  await ensureDefaultPrizes();
  const payout = await getPotPayout();
  const lastVerified = r.meta.lastVerifiedAt
    ? new Date(r.meta.lastVerifiedAt).toISOString().slice(0, 10)
    : "ALDRIG VERIFIERAD";
  const verifiedClass = r.meta.lastVerifiedAt ? "text-green" : "text-red";

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <header className="flex items-center justify-between border-b border-border pb-3 text-xs uppercase tracking-widest">
          <span className="text-yellow">COPA / HOW</span>
          <Link href="/" className="text-cyan">
            ← HEM
          </Link>
        </header>

        <section className="py-6">
          <h1 className="text-3xl font-bold uppercase tracking-tight text-yellow sm:text-4xl">
            SÅ HÄR FUNKAR DET
          </h1>
          <p className="mt-3 text-sm text-dim">
            Copa del Mundo är en kompisliga byggd på Aftonbladets manager-spel
            för fotbolls-VM 2026. Allt nedan är den faktiska regeluppsättning
            koden använder — om något här inte stämmer, stämmer inte heller
            poängen.
          </p>
        </section>

        <Block title="VERIFIERINGSSTATUS">
          <KV
            k="SENAST VERIFIERAD"
            v={
              <span className={`tabular-nums ${verifiedClass}`}>
                {lastVerified}
              </span>
            }
          />
          <KV
            k="KÄLL-RULESET"
            v={r.meta.sourceRulesetId ?? "—"}
          />
          <p className="mt-3 text-xs text-dim">
            Värden markerade <span className="text-yellow">UNVERIFIED</span>{" "}
            kommer från Aftonbladets förra säsong. Uppdateras när VM-rulesetet
            publicerats.
          </p>
        </Block>

        <Block title="SPELLÄGEN">
          <ul className="space-y-3 text-sm">
            <li>
              <span className="text-yellow">A · LIGAN</span>{" "}
              <span className="text-dim">
                — välj 11 spelare inom budget, byt mellan ronder, jaga toppen
                av tabellen.
              </span>
            </li>
            <li>
              <span className="text-yellow">B · DAGENS BET</span>{" "}
              <span className="text-dim">
                — admin lägger upp en fråga (spelare eller siffra), du svarar
                före deadline, rätt svar ger poäng. Egen tabell.
              </span>
            </li>
            <li>
              <span className="text-yellow">C · SIDOSPEL</span>{" "}
              <span className="text-dim">
                — visas på sajten men poäng/pengar hanteras offline.
              </span>
            </li>
          </ul>
        </Block>

        <Block title="LAG / TRUPP">
          <KV k="TRUPPSTORLEK" v={`${r.squadSize} SPELARE`} />
          <KV k="BUDGET" v={`${formatSek(r.budgetSek)} SEK`} />
          <KV k="MÅLVAKTER" v={range(r.positions.GK)} />
          <KV k="FÖRSVARARE" v={range(r.positions.DEF)} />
          <KV k="MITTFÄLTARE" v={range(r.positions.MID)} />
          <KV k="ANFALLARE" v={range(r.positions.FWD)} />
          <KV k="MAX PER KLUBB" v={`${r.maxFromSameClub}`} />
          <KV
            k="MAX PER LAND"
            v={r.maxFromSameCountry?.toString() ?? "INGEN GRÄNS"}
          />
        </Block>

        <Block title="GILTIGA FORMATIONER">
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm tabular-nums sm:grid-cols-3">
            {r.legalFormations.map((f: Formation) => (
              <li key={formationToString(f)} className="text-yellow">
                {formationToString(f)}
              </li>
            ))}
          </ul>
        </Block>

        <Block title="KAPTEN">
          <KV k="MULTIPLIKATOR" v={`${r.captainMultiplier}×`} />
          <KV
            k="ENDAST POSITIV"
            v={r.captainBonusOnlyPositive ? "JA" : "NEJ"}
          />
          <p className="mt-3 text-xs text-dim">
            Kaptenen får extra poäng motsvarande{" "}
            <span className="text-foreground">
              ({r.captainMultiplier} − 1) × spelarens tillväxt
            </span>
            {r.captainBonusOnlyPositive ? " — men bara om tillväxten är positiv." : "."}
          </p>
        </Block>

        <Block title="BYTEN">
          <KV k="GRATIS BYTEN / ROND" v={`${r.freeTransfersPerRound}`} />
          <KV k="BYTAVGIFT" v={`${pct(r.transferFeePct)} AV SÅLD SPELARE`} />
          <p className="mt-3 text-xs text-dim">
            Avgiften dras direkt från rondpoängen.
          </p>
        </Block>

        <Block title="POÄNG">
          <pre className="overflow-x-auto whitespace-pre text-[11px] leading-relaxed text-foreground">
{`RONDPOÄNG =
  Σ (varje spelares prisförändring i ronden)
  + (kapten.tillväxt × ${r.captainMultiplier - 1}) [endast om positiv]
  + (kvarvarande budget × ${pct(r.bankInterestPctPerRound)})
  − (summa bytavgifter denna rond)`}
          </pre>
          <p className="mt-3 text-xs text-dim">
            Spelarpriserna och deras tillväxt hämtas från Aftonbladets API. Vi
            sparar en oföränderlig snapshot per rond — gamla poäng kan aldrig
            ändras retroaktivt.
          </p>
        </Block>

        <Block title="PENGAR">
          <KV k="INSATS / DELTAGARE" v={`${r.stakePerUserSek} SEK`} />
          <KV
            k="GODKÄNDA LAG"
            v={<span className="tabular-nums">{payout.approvedCount}</span>}
          />
          <KV
            k="TOTAL POTT NU"
            v={
              <span className="tabular-nums text-yellow">
                {formatSek(payout.totalPotSek)} SEK
              </span>
            }
          />

          <div className="mt-5 space-y-4">
            {payout.pools.map((pool) => (
              <div key={pool.key} className="border border-border p-3">
                <p className="flex items-baseline justify-between text-xs">
                  <span className="text-yellow">{pool.label}</span>
                  <span className="tabular-nums text-dim">
                    <span className="text-foreground">
                      {bpsToPercent(pool.allocationBps)}
                    </span>{" "}
                    · {formatSek(pool.poolAmountSek)} SEK
                  </span>
                </p>
                {pool.places.length > 0 && (
                  <ul className="mt-2 divide-y divide-dotted divide-border/60 text-xs tabular-nums">
                    {pool.places.map((place) => (
                      <li
                        key={place.place}
                        className="flex items-baseline justify-between py-1"
                      >
                        <span className="text-dim">PLATS {place.place}</span>
                        <span>
                          <span className="text-foreground">
                            {bpsToPercent(place.shareBps)}
                          </span>
                          <span className="ml-3 text-yellow">
                            {formatSek(place.amountSek)} SEK
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          <p className="mt-4 text-xs text-dim">
            Vid lika poäng delas placeringen och vinstpengarna lika mellan
            inblandade lag.
          </p>
        </Block>

        <Block title="TRANSPARENS">
          <ul className="space-y-2 text-sm text-dim">
            <li>
              <span className="text-yellow">·</span> Alla regler ovan kommer
              direkt från koden — texten kan inte glida ifrån verkligheten.
            </li>
            <li>
              <span className="text-yellow">·</span> Varje rondpoäng pekar på
              den exakta spelar-snapshot som användes (se{" "}
              <span className="text-foreground">/audit</span> när det finns).
            </li>
            <li>
              <span className="text-yellow">·</span> Avvikelser från
              Aftonbladets regler loggas i{" "}
              <span className="text-foreground">RULES.md</span> i repo-historiken.
            </li>
          </ul>
        </Block>

        <p className="mt-8 text-center text-[10px] uppercase tracking-widest text-dim">
          ──── EOF ────
        </p>
      </div>
    </main>
  );
}

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border py-5">
      <h2 className="mb-3 text-xs uppercase tracking-widest text-yellow">
        {title}
      </h2>
      {children}
    </section>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dotted border-border/60 py-1 text-sm">
      <dt className="text-[11px] uppercase tracking-widest text-dim">{k}</dt>
      <dd className="tabular-nums text-foreground">{v}</dd>
    </div>
  );
}

function pct(fraction: number): string {
  // 0.01 → "1%", 0.025 → "2.5%"
  const v = fraction * 100;
  return Number.isInteger(v) ? `${v}%` : `${v.toFixed(2)}%`;
}

function formatSek(n: number): string {
  return n.toLocaleString("sv-SE").replace(/ /g, " ");
}

function range(c: { min: number; max: number }): string {
  return c.min === c.max ? `${c.min}` : `${c.min}–${c.max}`;
}
