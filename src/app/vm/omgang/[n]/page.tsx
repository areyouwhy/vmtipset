import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { WcMatchLine } from "@/components/wc-match-line";
import {
  getAllMatches,
  getMatchGroups,
  getTeamLookup,
  type WcMatchGroup,
} from "@/lib/wc-tournament";

export const dynamic = "force-dynamic";

const ROUND_TITLES: Record<number, string> = {
  1: "GRUPPSPEL · OMGÅNG 1",
  2: "GRUPPSPEL · OMGÅNG 2",
  3: "GRUPPSPEL · OMGÅNG 3",
  4: "SLUTSPEL · SEXTONDELSFINAL",
  5: "SLUTSPEL · ÅTTONDELSFINAL",
  6: "SLUTSPEL · KVARTSFINAL",
  7: "SLUTSPEL · SEMIFINAL & BRONS",
  8: "SLUTSPEL · FINAL",
};

const KNOCKOUT_ROUND = (n: number) => n >= 4;

export default async function OmgangPage({
  params,
}: {
  params: Promise<{ n: string }>;
}) {
  const { n: nStr } = await params;
  const n = Number.parseInt(nStr, 10);
  if (!Number.isFinite(n) || n < 1 || n > 8) notFound();

  const [allMatches, mgsById, teamsById] = await Promise.all([
    getAllMatches(),
    getMatchGroups(),
    getTeamLookup(),
  ]);
  const matches = allMatches
    .filter((m) => m.roundNumber === n)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));

  // Bucket by matchGroup (Group A, Last 32, etc.) so each section gets its
  // own header. Sort group sections alphabetically by name.
  const byGroup = new Map<number, typeof matches>();
  for (const m of matches) {
    const arr = byGroup.get(m.matchGroupId) ?? [];
    arr.push(m);
    byGroup.set(m.matchGroupId, arr);
  }
  const sections = [...byGroup.entries()]
    .map(([id, ms]) => ({ group: mgsById.get(id), matches: ms }))
    .filter((s): s is { group: WcMatchGroup; matches: typeof matches } => !!s.group)
    .sort((a, b) => a.group.name.localeCompare(b.group.name));

  const isKnockout = KNOCKOUT_ROUND(n);
  const parentLabel = isKnockout ? "SLUTSPEL" : "GRUPPSPEL";
  const parentHref = isKnockout ? "/vm/slutspel" : "/vm/gruppspel";

  const prevN = n > 1 ? n - 1 : null;
  const nextN = n < 8 ? n + 1 : null;

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <Breadcrumbs
          trail={[
            { label: "VM", href: "/vm" },
            { label: parentLabel, href: parentHref },
            { label: `OMGÅNG ${n}` },
          ]}
        />

        <section className="py-6">
          <p className="text-[10px] uppercase tracking-widest text-dim">
            OMGÅNG {n}
          </p>
          <h1 className="mt-1 text-2xl font-bold uppercase tracking-tight text-yellow">
            {ROUND_TITLES[n] ?? `OMGÅNG ${n}`}
          </h1>
          <p className="mt-2 text-sm text-dim">
            {matches.length} matcher.
          </p>
        </section>

        <nav className="mb-4 flex items-center justify-between border-y border-border py-2 text-[10px] uppercase tracking-widest">
          {prevN ? (
            <Link
              href={`/vm/omgang/${prevN}`}
              className="text-cyan hover:text-yellow"
            >
              ← OMGÅNG {prevN}
            </Link>
          ) : (
            <span className="text-dim">—</span>
          )}
          <span className="text-dim">{n} / 8</span>
          {nextN ? (
            <Link
              href={`/vm/omgang/${nextN}`}
              className="text-cyan hover:text-yellow"
            >
              OMGÅNG {nextN} →
            </Link>
          ) : (
            <span className="text-dim">—</span>
          )}
        </nav>

        <div className="space-y-5">
          {sections.length === 0 && (
            <p className="border border-dashed border-border p-3 text-xs text-dim">
              — inga matcher i denna omgång ännu —
            </p>
          )}
          {sections.map(({ group, matches: ms }) => {
            // Group names look like "Group A". Last char is the group letter,
            // so we can deep-link to the standings anchor on /vm/gruppspel.
            const letterMatch = group.name.match(/([A-Z])\s*$/);
            const letter = letterMatch?.[1] ?? null;
            return (
            <section key={group.externalId}>
              <h2 className="border-b border-border pb-1 text-[10px] uppercase tracking-widest text-cyan">
                {letter && !isKnockout ? (
                  <Link
                    href={`/vm/gruppspel#grupp-${letter}`}
                    className="hover:text-yellow"
                  >
                    {group.name}
                  </Link>
                ) : (
                  group.name
                )}
                <span className="ml-2 text-dim">{ms.length}</span>
              </h2>
              <ul className="divide-y divide-border/40">
                {ms.map((m) => (
                  <WcMatchLine key={m.externalId} m={m} teamsById={teamsById} />
                ))}
              </ul>
            </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
