import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { clubFor } from "@/data/player-clubs";
import { clubSlug } from "@/lib/clubs";
import { Jersey } from "@/lib/jersey";
import { getPlayerDetail } from "@/lib/players-data";

export const revalidate = 600;

export default async function PublicPlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getPlayerDetail(id).catch(() => null);
  if (!detail) notFound();

  const { player, club, rounds: roundLines, eventTypes: eventTypeList, stats } = detail;
  // Rebuild the Map here (after the cache boundary) — see PlayerDetail.eventTypes.
  const eventTypes = new Map(eventTypeList.map((t) => [t.id, t] as const));
  const countryCode = club?.countryCode ?? null;
  const domesticClub = clubFor(player.externalId);

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <Breadcrumbs
          trail={[
            { label: "SPELARE", href: "/spelare" },
            { label: player.name.toUpperCase() },
          ]}
        />

        <section className="flex items-start gap-4 py-6">
          {countryCode ? (
            <Link href={`/landslag/${countryCode}`} className="shrink-0">
              <Jersey code={countryCode} size={72} />
            </Link>
          ) : null}
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-dim">
              {player.position} · {club?.shortName ?? club?.name ?? "—"}
            </p>
            <h1 className="mt-1 truncate text-2xl font-bold uppercase tracking-tight text-yellow sm:text-3xl">
              {player.name}
            </h1>
            {countryCode && (
              <p className="mt-1 text-xs uppercase tracking-widest text-dim">
                <Link
                  href={`/landslag/${countryCode}`}
                  className="text-cyan hover:underline"
                >
                  {countryCode} ↗
                </Link>
                {domesticClub && (
                  <>
                    <span className="mx-2 text-dim">·</span>
                    <span className="text-cyan/80">KLUBB: </span>
                    <Link
                      href={`/klubblag/${clubSlug(domesticClub)}`}
                      className="text-foreground hover:text-cyan"
                    >
                      {domesticClub}
                    </Link>
                  </>
                )}
              </p>
            )}
          </div>
        </section>

        <section className="mb-6 border border-yellow/40 p-4">
          <p className="text-[10px] uppercase tracking-widest text-yellow">
            TOTALT I VM 2026
          </p>
          <dl className="mt-2 grid grid-cols-4 gap-3 text-[11px] tabular-nums sm:grid-cols-8">
            <StatCell label="TILLVÄXT" value={fmtSek(stats.totalGrowthSek)} tone={stats.totalGrowthSek > 0 ? "green" : stats.totalGrowthSek < 0 ? "red" : undefined} />
            <StatCell label="MÅL" value={stats.goals.toString()} />
            <StatCell label="ASSIST" value={stats.assists.toString()} />
            <StatCell label="GULA" value={stats.yellowCards.toString()} />
            <StatCell label="RÖDA" value={stats.redCards.toString()} />
            <StatCell label="SK" value={stats.shotsOnGoal.toString()} />
            <StatCell label="RÄ" value={stats.saves.toString()} />
            <StatCell label="⭐" value={stats.manOfTheMatch.toString()} />
          </dl>
        </section>

        <section className="space-y-4">
          <h2 className="text-[10px] uppercase tracking-widest text-dim">
            RONDVÄRDEN
          </h2>
          {roundLines.length === 0 && (
            <p className="text-sm text-dim">— inga ronder ännu —</p>
          )}
          {roundLines.map((line) => {
            const effective = line.manual ?? line.api;
            return (
              <article
                key={line.roundId}
                className="border border-border p-3"
              >
                <header className="flex items-baseline justify-between gap-3 text-xs uppercase tracking-widest">
                  <span>
                    <span className="text-dim">ROND </span>
                    <span className="text-yellow tabular-nums">
                      {String(line.roundNumber).padStart(2, "0")}
                    </span>
                    <span className="text-foreground"> — {line.roundName}</span>
                  </span>
                  <span
                    className={
                      line.manual
                        ? "text-yellow"
                        : line.api
                          ? "text-cyan"
                          : "text-dim"
                    }
                  >
                    {line.manual ? "JUSTERAD" : line.api ? "API" : "—"}
                  </span>
                </header>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px] tabular-nums">
                  <KV
                    k="PRIS"
                    v={
                      effective
                        ? `${(effective.priceSek / 1_000_000).toFixed(2)}M`
                        : "—"
                    }
                  />
                  <KV
                    k="TILLVÄXT"
                    v={effective ? fmtSek(effective.growthSek) : "—"}
                    tone={
                      effective && effective.growthSek > 0
                        ? "green"
                        : effective && effective.growthSek < 0
                          ? "red"
                          : undefined
                    }
                  />
                </dl>

                {effective && effective.events.length > 0 && (
                  <EventBreakdown
                    events={effective.events}
                    eventTypes={eventTypes}
                    growthSek={effective.growthSek}
                  />
                )}
                {effective &&
                  effective.events.length === 0 &&
                  effective.growthSek !== 0 && (
                    <p className="mt-3 text-[10px] text-dim">
                      — Inga händelser rapporterade (men tillväxten är inte
                      noll, kan vara aggregerade pris/popularitetsförändringar)
                    </p>
                  )}
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}

function EventBreakdown({
  events,
  eventTypes,
}: {
  events: Array<{ typeId: number; amount: number }>;
  eventTypes: Map<number, { title: string }>;
  growthSek: number;
}) {
  const rows = events.map((e) => {
    const type = eventTypes.get(e.typeId);
    return {
      typeId: e.typeId,
      title: type?.title ?? `?#${e.typeId}`,
      amount: e.amount,
    };
  });
  // Stable order: by name.
  rows.sort((a, b) => a.title.localeCompare(b.title));
  return (
    <div className="mt-3 border-t border-border/60 pt-2">
      <p className="text-[10px] uppercase tracking-widest text-dim">
        HÄNDELSER I RONDEN
      </p>
      <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] tabular-nums sm:grid-cols-3">
        {rows.map((r) => (
          <li
            key={r.typeId}
            className="flex items-baseline gap-2"
          >
            <span className="text-yellow">{r.amount}×</span>
            <span className="text-foreground">{r.title}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] text-dim">
        Aftonbladets exakta poäng beror på spelarens position (mål av
        försvarare ≠ mål av anfallare). Vi visar händelserna; tillväxten
        ovan är Aftonbladets aggregerade SEK för ronden.
      </p>
    </div>
  );
}

function StatCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "red";
}) {
  const c =
    tone === "green"
      ? "text-green"
      : tone === "red"
        ? "text-red"
        : "text-foreground";
  return (
    <div>
      <dt className="text-[9px] uppercase tracking-widest text-dim">{label}</dt>
      <dd className={`mt-0.5 font-bold ${c}`}>{value}</dd>
    </div>
  );
}

function KV({
  k,
  v,
  tone,
}: {
  k: string;
  v: string;
  tone?: "green" | "red";
}) {
  const c =
    tone === "green"
      ? "text-green"
      : tone === "red"
        ? "text-red"
        : "text-foreground";
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-widest text-dim">{k}</dt>
      <dd className={c}>{v}</dd>
    </div>
  );
}

function fmtSek(n: number): string {
  if (n === 0) return "0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k`;
  return `${sign}${abs}`;
}
