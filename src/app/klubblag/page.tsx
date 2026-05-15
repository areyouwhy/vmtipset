import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { getAllClubs } from "@/lib/clubs";

export const dynamic = "force-dynamic";

export default async function KlubblagIndexPage() {
  const clubs = await getAllClubs();
  const totalPlayers = clubs.reduce((n, c) => n + c.playerCount, 0);

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <Breadcrumbs trail={[{ label: "KLUBBLAG" }]} />

        <section className="py-6">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-yellow">
            KLUBBLAG
          </h1>
          <p className="mt-2 text-sm text-dim">
            {clubs.length} klubblag representerade · {totalPlayers} spelare
            mappade till sina inhemska klubbar. Klicka för truppen från
            varje klubb. Sorterat efter antal VM-spelare per klubb.
          </p>
        </section>

        <ul className="divide-y divide-border border border-border">
          {clubs.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/klubblag/${c.slug}`}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-3 p-3 text-sm transition hover:bg-yellow/5"
              >
                <span className="min-w-0 truncate text-foreground">
                  {c.name}
                </span>
                <span className="text-[11px] tabular-nums text-cyan">
                  {c.playerCount}{" "}
                  <span className="text-dim">SP</span>
                </span>
                <span className="text-[10px] uppercase tracking-widest text-cyan">
                  →
                </span>
              </Link>
            </li>
          ))}
          {clubs.length === 0 && (
            <li className="p-4 text-center text-sm text-dim">
              — inga klubbar mappade ännu —
            </li>
          )}
        </ul>
      </div>
    </main>
  );
}
