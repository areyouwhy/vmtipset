import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Jersey } from "@/lib/jersey";
import { getAllNations } from "@/lib/nation-data";
import { fifaRank, FIFA_RANK_SOURCE_DATE } from "@/data/fifa-rank";
import { GROUPS, GROUP_KEYS } from "@/data/wc-groups";

export const dynamic = "force-dynamic";

export default async function LandslagIndexPage() {
  const nations = await getAllNations();
  const byCode = new Map(nations.map((n) => [n.countryCode, n]));

  // Some teams in the groups file may not have player data yet — render
  // them as a row with "0 spelare" so the group still shows complete.
  type Row = {
    countryCode: string;
    countryName: string;
    playerCount: number;
    rank: number | null;
    dreamTeamValueSek: number | null;
  };
  function rowFor(code: string): Row {
    const n = byCode.get(code);
    return {
      countryCode: code,
      countryName: n?.countryName ?? code,
      playerCount: n?.playerCount ?? 0,
      rank: fifaRank(code),
      dreamTeamValueSek: n?.dreamTeamValueSek ?? null,
    };
  }

  // Any nations we have data for but that aren't in the groups file land in
  // an "övriga" bucket so they're never lost.
  const assignedCodes = new Set<string>();
  for (const key of GROUP_KEYS) for (const code of GROUPS[key]) assignedCodes.add(code);
  const orphans = nations
    .filter((n) => !assignedCodes.has(n.countryCode))
    .map((n) => rowFor(n.countryCode));

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <Breadcrumbs trail={[{ label: "LANDSLAG" }]} />

        <section className="py-6">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-yellow">
            LANDSLAG
          </h1>
          <p className="mt-2 text-sm text-dim">
            Alla 48 landslag i VM 2026, indelade i sina gruppspels-grupper.
            FIFA-rank inom parentes ({FIFA_RANK_SOURCE_DATE}).
          </p>
        </section>

        <div className="space-y-6">
          {GROUP_KEYS.map((key) => {
            const rows = GROUPS[key]
              .map(rowFor)
              .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
            return (
              <section
                key={key}
                id={`grupp-${key}`}
                className="border border-border"
              >
                <header className="flex items-baseline justify-between gap-3 border-b border-border px-3 py-2 text-xs uppercase tracking-widest">
                  <span>
                    <span className="text-dim">GRUPP </span>
                    <span className="text-yellow">{key}</span>
                  </span>
                  <span className="text-[10px] text-dim">
                    {rows.length} LAG
                  </span>
                </header>
                <ul className="divide-y divide-border">
                  {rows.map((r) => (
                    <NationRow key={r.countryCode} row={r} />
                  ))}
                </ul>
              </section>
            );
          })}

          {orphans.length > 0 && (
            <section className="border border-border">
              <header className="flex items-baseline justify-between gap-3 border-b border-border px-3 py-2 text-xs uppercase tracking-widest">
                <span className="text-dim">ÖVRIGA</span>
                <span className="text-[10px] text-dim">
                  {orphans.length} LAG
                </span>
              </header>
              <ul className="divide-y divide-border">
                {orphans
                  .sort(
                    (a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity),
                  )
                  .map((r) => (
                    <NationRow key={r.countryCode} row={r} />
                  ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

function NationRow({
  row,
}: {
  row: {
    countryCode: string;
    countryName: string;
    playerCount: number;
    rank: number | null;
    dreamTeamValueSek: number | null;
  };
}) {
  return (
    <li>
      <Link
        href={`/landslag/${row.countryCode}`}
        className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 p-3 text-sm transition hover:bg-yellow/5"
      >
        <Jersey code={row.countryCode} size={32} />
        <span className="min-w-0">
          <span className="block truncate text-foreground">
            {row.countryName}
          </span>
          <span className="block text-[10px] uppercase tracking-widest text-dim">
            {row.countryCode} · FIFA{" "}
            <span className="text-yellow">
              {row.rank === null ? "—" : `#${row.rank}`}
            </span>{" "}
            ·{" "}
            <span className="text-cyan">{row.playerCount}</span> SP
          </span>
        </span>
        <span className="flex flex-col items-end leading-tight">
          <span className="text-[11px] tabular-nums text-green">
            {row.dreamTeamValueSek === null
              ? "—"
              : `${(row.dreamTeamValueSek / 1_000_000).toFixed(1)}M`}
          </span>
          <span className="text-[8px] uppercase tracking-widest text-dim">
            DREAM XI
          </span>
        </span>
        <span className="text-[10px] uppercase tracking-widest text-cyan">→</span>
      </Link>
    </li>
  );
}
