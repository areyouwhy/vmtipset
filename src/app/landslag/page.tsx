import Link from "next/link";
import { Jersey } from "@/lib/jersey";
import { getAllNations } from "@/lib/nation-data";
import { fifaRank, FIFA_RANK_SOURCE_DATE } from "@/data/fifa-rank";

export const dynamic = "force-dynamic";

export default async function LandslagIndexPage() {
  const nations = await getAllNations();
  const sorted = [...nations].sort((a, b) => {
    const ra = fifaRank(a.countryCode) ?? Infinity;
    const rb = fifaRank(b.countryCode) ?? Infinity;
    if (ra !== rb) return ra - rb;
    return a.countryName.localeCompare(b.countryName);
  });

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <header className="flex items-center justify-between border-b border-border pb-3 text-xs uppercase tracking-widest">
          <span className="text-yellow">COPA / LANDSLAG</span>
          <Link href="/" className="text-cyan">
            ← START
          </Link>
        </header>

        <section className="py-6">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-yellow">
            LANDSLAG
          </h1>
          <p className="mt-2 text-sm text-dim">
            Alla {sorted.length} landslag i VM 2026, sorterade efter
            FIFA-rankning ({FIFA_RANK_SOURCE_DATE}). Klicka för dyrastes
            startelva och hela truppen.
          </p>
        </section>

        <ul className="divide-y divide-border border border-border">
          {sorted.map((n) => {
            const rank = fifaRank(n.countryCode);
            return (
              <li key={n.countryCode}>
                <Link
                  href={`/landslag/${n.countryCode}`}
                  className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-3 p-3 text-sm transition hover:bg-yellow/5"
                >
                  <span className="w-8 text-right text-[11px] tabular-nums text-dim">
                    {rank === null ? "—" : `#${rank}`}
                  </span>
                  <Jersey code={n.countryCode} size={32} />
                  <span className="min-w-0">
                    <span className="block truncate text-foreground">
                      {n.countryName}
                    </span>
                    <span className="block text-[10px] uppercase tracking-widest text-dim">
                      {n.countryCode} ·{" "}
                      <span className="text-cyan">{n.playerCount}</span> spelare
                    </span>
                  </span>
                  <span className="text-[10px] uppercase tracking-widest text-cyan">
                    →
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
