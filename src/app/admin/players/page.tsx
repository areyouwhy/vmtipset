import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { isAdmin } from "@/lib/auth";
import { getPlayerListRows } from "@/lib/players-data";
import { PlayerListClient } from "./list-client";

export const dynamic = "force-dynamic";

export default async function AdminPlayersPage() {
  if (!(await isAdmin())) redirect("/app");
  // Admin gets the full list including inactive players, so they can find
  // and re-enable a player who was dropped by Aftonbladet.
  const rows = await getPlayerListRows({ includeInactive: true });

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <Breadcrumbs
          trail={[
            { label: "ADMIN", href: "/admin" },
            { label: "SPELARE" },
          ]}
        />

        <section className="py-6">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-yellow">
            SPELARE
          </h1>
          <p className="mt-2 text-sm text-dim">
            Klicka på en spelare för att se snapshot per rond eller skriva
            över värden manuellt. Manuella ändringar markeras med{" "}
            <span className="text-yellow">M</span> och vinner över API-data
            vid poängräkning.
          </p>
        </section>

        <PlayerListClient rows={rows} />
      </div>
    </main>
  );
}
