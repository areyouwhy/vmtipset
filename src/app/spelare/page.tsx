import { Breadcrumbs } from "@/components/breadcrumbs";
import { getPlayerListRows } from "@/lib/players-data";
import { PublicPlayersList } from "./list-client";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const rows = await getPlayerListRows();

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <Breadcrumbs trail={[{ label: "SPELARE" }]} />

        <section className="py-6">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-yellow">
            SPELARE
          </h1>
          <p className="mt-2 text-sm text-dim">
            Alla {rows.length} spelare i VM 2026. Filtrera på position eller
            landslag. Klicka på en spelare för rondvärden.
          </p>
        </section>

        <PublicPlayersList rows={rows} />
      </div>
    </main>
  );
}
