import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Jersey } from "@/lib/jersey";
import { getClubDetail, type ClubPlayer } from "@/lib/clubs";

export const revalidate = 3600;

export default async function ClubPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const detail = await getClubDetail(slug).catch(() => null);
  if (!detail) notFound();

  // Group by position for display.
  const byPos: Record<"GK" | "DEF" | "MID" | "FWD", ClubPlayer[]> = {
    GK: detail.players.filter((p) => p.position === "GK"),
    DEF: detail.players.filter((p) => p.position === "DEF"),
    MID: detail.players.filter((p) => p.position === "MID"),
    FWD: detail.players.filter((p) => p.position === "FWD"),
  };
  // Unique countries represented at this club (for a small badge strip).
  const countries = [
    ...new Set(detail.players.flatMap((p) => (p.countryCode ? [p.countryCode] : []))),
  ];

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <Breadcrumbs
          trail={[
            { label: "KLUBBLAG", href: "/klubblag" },
            { label: detail.name.toUpperCase() },
          ]}
        />

        <section className="py-6">
          <p className="text-[10px] uppercase tracking-widest text-dim">
            KLUBBLAG
          </p>
          <h1 className="mt-1 text-2xl font-bold uppercase tracking-tight text-yellow sm:text-3xl">
            {detail.name}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] uppercase tracking-widest">
            <span>
              <span className="text-dim">VM-SPELARE </span>
              <span className="text-cyan tabular-nums">
                {detail.players.length}
              </span>
            </span>
            <span>
              <span className="text-dim">LAGVÄRDE </span>
              <span className="text-yellow tabular-nums">
                {(detail.squadValueSek / 1_000_000).toFixed(1)}M
              </span>
            </span>
            {detail.latestRoundNumber != null && (
              <span>
                <span className="text-dim">Δ VÄRDE </span>
                <GrowthInline n={detail.totalGrowthSek} />
              </span>
            )}
            {countries.length > 0 && (
              <span className="flex items-center gap-1">
                <span className="text-dim">LANDSLAG </span>
                {countries.map((code) => (
                  <Link
                    key={code}
                    href={`/landslag/${code}`}
                    className="inline-flex items-center"
                    title={code}
                  >
                    <Jersey code={code} size={18} />
                  </Link>
                ))}
              </span>
            )}
          </p>
          {detail.latestRoundNumber != null &&
            (detail.ownedByTeamCount > 0 || detail.mostPicked) && (
              <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] uppercase tracking-widest">
                <span>
                  <span className="text-dim">ÄGS AV </span>
                  <span className="text-cyan tabular-nums">
                    {detail.ownedByTeamCount}
                  </span>
                  <span className="text-dim"> / {detail.ourTeamTotal} LAG</span>
                </span>
                {detail.mostPicked && (
                  <span>
                    <span className="text-dim">POPULÄRAST </span>
                    <Link
                      href={`/spelare/${detail.mostPicked.id}`}
                      className="text-foreground hover:text-cyan"
                    >
                      {detail.mostPicked.name}
                    </Link>
                    <span className="text-dim tabular-nums">
                      {" "}
                      ({detail.mostPicked.count})
                    </span>
                  </span>
                )}
              </p>
            )}
        </section>

        <div className="space-y-5">
          {(
            [
              { label: "MÅLVAKT", key: "GK" as const },
              { label: "FÖRSVAR", key: "DEF" as const },
              { label: "MITTFÄLT", key: "MID" as const },
              { label: "ANFALL", key: "FWD" as const },
            ]
          )
            .filter(({ key }) => byPos[key].length > 0)
            .map(({ label, key }) => (
              <section key={key}>
                <h2 className="mb-1 text-[10px] uppercase tracking-widest text-dim">
                  {label}{" "}
                  <span className="text-cyan">{byPos[key].length}</span>
                </h2>
                <ul className="divide-y divide-border border border-border">
                  {byPos[key].map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/spelare/${p.id}`}
                        className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-3 p-2 text-sm transition hover:bg-yellow/5"
                      >
                        <Jersey code={p.countryCode} size={20} />
                        <span className="text-yellow tabular-nums">
                          {p.position}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-foreground">
                            {p.name}
                          </span>
                          <span className="block text-[10px] uppercase tracking-widest text-dim">
                            {p.countryCode ?? "—"}
                            {p.ourOwnerCount > 0 && (
                              <span className="text-cyan">
                                {" · "}
                                {p.ourOwnerCount} lag
                              </span>
                            )}
                            {p.abPopularityPct >= 0.5 && (
                              <span className="text-dim">
                                {" · "}
                                {p.abPopularityPct.toFixed(0)}% AB
                              </span>
                            )}
                          </span>
                        </span>
                        <span className="text-right tabular-nums">
                          <span className="block text-foreground">
                            {p.priceSek === null
                              ? "—"
                              : `${(p.priceSek / 1_000_000).toFixed(1)}M`}
                          </span>
                          {p.growthSek != null && p.growthSek !== 0 && (
                            <span className="block text-[10px]">
                              <GrowthInline n={p.growthSek} />
                            </span>
                          )}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>
      </div>
    </main>
  );
}

function GrowthInline({ n }: { n: number }) {
  const color = n > 0 ? "text-green" : n < 0 ? "text-red" : "text-dim";
  const arrow = n > 0 ? "↑" : n < 0 ? "↓" : "";
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  const v =
    abs >= 1_000_000
      ? `${sign}${(abs / 1_000_000).toFixed(2)}M`
      : abs >= 1_000
        ? `${sign}${Math.round(abs / 1_000)}k`
        : `${sign}${abs}`;
  return (
    <span className={`${color} tabular-nums`}>
      {arrow}
      {v}
    </span>
  );
}
