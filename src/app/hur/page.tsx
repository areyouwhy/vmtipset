import { desc } from "drizzle-orm";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { db } from "@/db";
import { fantasyEventTypes } from "@/db/schema";
import {
  currentRules,
  formationToString,
  type Formation,
} from "@/lib/rules";
import { getPotPayout } from "@/lib/prize-config";
import { bpsToPercent } from "@/lib/prizes";

export const metadata = {
  title: "HOW — Copa del Mundo 2026",
  description:
    "How the league works, what the rules are, and how scoring is calculated.",
};

// The pot preview reads the live approved-user count + pool config — cached
// via unstable_cache + revalidateTag, so the page itself can be statically
// rendered at the CDN.
export const revalidate = 600;

export default async function HowPage() {
  const r = currentRules;
  const [payout, scoringRules] = await Promise.all([
    getPotPayout().catch(() => null),
    db
      .select()
      .from(fantasyEventTypes)
      .orderBy(desc(fantasyEventTypes.valueSek))
      .catch(() => [] as typeof fantasyEventTypes.$inferSelect[]),
  ]);
  // Drop entries Aftonbladet keeps at 0 value (lineup, substitute in/out) —
  // they're status markers, not scoring rules.
  const scored = scoringRules.filter((t) => t.valueSek !== 0);
  const lastVerified = r.meta.lastVerifiedAt
    ? new Date(r.meta.lastVerifiedAt).toISOString().slice(0, 10)
    : "ALDRIG VERIFIERAD";
  const verifiedClass = r.meta.lastVerifiedAt ? "text-green" : "text-red";

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <Breadcrumbs trail={[{ label: "HUR" }]} />

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
            Alla värden nedan är verifierade mot Aftonbladets WC 2026
            ruleset (id <span className="text-foreground">{r.meta.sourceRulesetId}</span>).
            Datumet ovan flyttas så fort vi kör en ny verifiering.
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
              <span className="text-yellow">B · SIDOSPEL</span>{" "}
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
          <KV k="MAX PER LANDSLAG" v={`${r.maxFromSameClub}`} />
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
        </Block>

        <Block title="BYTEN">
          <KV k="GRATIS BYTEN / ROND" v={`${r.freeTransfersPerRound}`} />
          <KV
            k="BYTAVGIFT"
            v={`${pct(r.transferFeePct)} AV KÖPT SPELARE`}
          />
          <p className="mt-3 text-xs text-dim">
            När du säljer en spelare får banken pengar = säljpriset. När du
            köper en spelare betalar banken köppriset PLUS{" "}
            {pct(r.transferFeePct)} avgift på köppriset. Allt sker när
            bytfönstret stänger — inte under matcherna. Före första rondens
            matcher är alla byten gratis.
          </p>
        </Block>

        <Block title="LAGVÄRDE — DET DU TÄVLAR MED">
          <pre className="overflow-x-auto whitespace-pre text-[11px] leading-relaxed text-foreground">
{`LAGVÄRDE  =  SQUAD VÄRDE  +  BANK

SQUAD VÄRDE  =  Σ (nuvarande pris för dina 11 spelare)
                                                       ← drivs av Aftonbladets prissättning
BANK_N       =  BANK_{N−1}
              + Σ (sälj − köp − avgift) för rond-N byten
              + ränta (${pct(r.bankInterestPctPerRound)} på bank-saldot efter bytfönstret)
              + kaptenbonus
                                                       ← vår egen ledger

Δ LAGVÄRDE i ronden  =  squad-drift  +  bank-drift
                     =  Σ tillväxt + ränta + kapten
                        + (sälj − köp) − avgift`}
          </pre>
          <p className="mt-3 text-xs text-dim">
            Det här är den ENDA siffran som spelar roll för placeringen. Den
            som har högst lagvärde när VM är slut vinner.
          </p>
          <p className="mt-2 text-xs text-dim">
            Ränta får du bara på pengar i banken, inte på pengar som ligger
            i spelare. Det är en avvägning: satsa allt på dyra spelare för
            stor tillväxt, eller håll kapital i banken för säker avkastning.
          </p>
          <p className="mt-2 text-xs text-dim">
            Spelarpriser och tillväxt kommer från Aftonbladets API. Tillväxt
            är precis prisförändringen — vi sparar en oföränderlig snapshot
            per rond så gamla värden aldrig kan ändras retroaktivt.
          </p>
        </Block>

        <Block title="KAPTENBONUS — HUR DEN LANDAR">
          <pre className="overflow-x-auto whitespace-pre text-[11px] leading-relaxed text-foreground">
{`KAPTENBONUS  =  kaptenens tillväxt × (${r.captainMultiplier} − 1)
                ${r.captainBonusOnlyPositive ? "// endast om positiv" : ""}`}
          </pre>
          <p className="mt-3 text-xs text-dim">
            Krediteras DIN BANK, inte spelarens pris. Spelarens marknadspris
            hos Aftonbladet rör sig inte av att du valt hen som kapten — det
            är vår interna belöning för att ha satsat rätt.
          </p>
        </Block>

        {scored.length > 0 && (
          <Block title="POÄNGSYSTEM — AFTONBLADETS REGLER">
            <p className="text-xs text-dim">
              Komplett scoring-katalog från Aftonbladets ruleset.
              Spelarens tillväxt i SEK per rond är summan av dessa värden för
              de händelser hen är inblandad i. Vi visar händelser per spelare
              på <span className="text-cyan">/spelare/[id]</span>.
            </p>
            <div className="mt-3 overflow-x-auto border border-border">
              <table className="w-full text-[11px] tabular-nums">
                <thead className="text-[9px] uppercase tracking-widest text-dim">
                  <tr className="border-b border-border">
                    <th className="px-2 py-1.5 text-left">HÄNDELSE</th>
                    <th className="px-2 py-1.5 text-right">VÄRDE (SEK)</th>
                  </tr>
                </thead>
                <tbody>
                  {scored.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b border-dotted border-border/40"
                    >
                      <td className="px-2 py-1 text-foreground">{t.title}</td>
                      <td
                        className={`px-2 py-1 text-right ${
                          t.valueSek > 0
                            ? "text-green"
                            : t.valueSek < 0
                              ? "text-red"
                              : "text-dim"
                        }`}
                      >
                        {t.valueSek > 0 ? "+" : ""}
                        {t.valueSek.toLocaleString("sv-SE").replace(/ /g, " ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[10px] uppercase tracking-widest text-dim">
              {scored.length} REGLER · KÄLLA: AFTONBLADETS RULESET
            </p>
          </Block>
        )}

        <Block title="PENGAR">
          <KV k="INSATS / DELTAGARE" v={`${r.stakePerUserSek} SEK`} />
          <KV
            k="GODKÄNDA LAG"
            v={<span className="tabular-nums">{payout?.approvedCount ?? "—"}</span>}
          />
          <KV
            k="TOTAL POTT NU"
            v={
              <span className="tabular-nums text-yellow">
                {payout ? `${formatSek(payout.totalPotSek)} SEK` : "—"}
              </span>
            }
          />

          <div className="mt-5 space-y-4">
            {(payout?.pools ?? []).filter((p) => p.allocationBps > 0).map((pool) => (
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
              <a href="/hur/audit" className="text-cyan hover:underline">
                /hur/audit
              </a>{" "}
              när det finns).
            </li>
            <li>
              <span className="text-yellow">·</span> Avvikelser från
              Aftonbladets regler loggas i{" "}
              <a
                href="https://github.com/areyouwhy/vmtipset/blob/main/RULES.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan hover:underline"
              >
                RULES.md
              </a>
              .
            </li>
            <li>
              <span className="text-yellow">·</span> Hela kodbasen är öppen{" "}
              —{" "}
              <a
                href="https://github.com/areyouwhy/vmtipset"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan hover:underline"
              >
                github.com/areyouwhy/vmtipset
              </a>
              .
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
