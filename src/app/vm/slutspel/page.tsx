import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { getKnockoutView } from "@/lib/wc-tournament";
import { KnockoutTabs } from "./client";

export const revalidate = 600;

export default async function KnockoutPage() {
  const view = await getKnockoutView();
  const byStage = new Map(view.stages.map((s) => [s.stage, s]));

  const stages = {
    r32: byStage.get("r32")?.matches ?? [],
    r16: byStage.get("r16")?.matches ?? [],
    qf: byStage.get("qf")?.matches ?? [],
    sf: byStage.get("sf")?.matches ?? [],
    final: byStage.get("final")?.matches ?? [],
    bronze: byStage.get("bronze")?.matches ?? [],
  };
  const totalMatches = Object.values(stages).reduce((n, ms) => n + ms.length, 0);

  // Flatten team lookup for the client (Map isn't serialisable).
  const teams = [...view.teamsById.values()].map((t) => ({
    id: t.externalId,
    code: t.code,
    name: t.name,
  }));

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <Breadcrumbs
          trail={[
            { label: "VM", href: "/vm" },
            { label: "SLUTSPEL" },
          ]}
          right={
            <Link href="/vm/gruppspel" className="text-cyan hover:text-yellow">
              ← GRUPPSPEL
            </Link>
          }
        />

        <section className="py-6">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-yellow">
            SLUTSPEL
          </h1>
          <p className="mt-2 text-sm text-dim">
            Klicka på en runda för att se matcherna. {totalMatches} matcher
            från sextondelsfinal till final, live från Aftonbladet.
          </p>
        </section>

        <KnockoutTabs stages={stages} teams={teams} />
      </div>
    </main>
  );
}
