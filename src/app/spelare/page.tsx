import { Breadcrumbs } from "@/components/breadcrumbs";
import { getPlayerListRows } from "@/lib/players-data";
import { PublicPlayersList } from "./list-client";

export const revalidate = 600;

export default async function PlayersPage() {
  const rows = await getPlayerListRows().catch(() => null);
  if (!rows) {
    return (
      <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
        <div className="mx-auto w-full max-w-3xl">
          <Breadcrumbs trail={[{ label: "SPELARE" }]} />
          <p className="mt-8 border border-yellow/30 bg-yellow/5 p-4 text-sm text-dim">
            Underhåll pågår — försök igen om en stund.
          </p>
        </div>
      </main>
    );
  }

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
