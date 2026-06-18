import { Breadcrumbs } from "@/components/breadcrumbs";
import snackStats from "@/data/snack-stats.json";
import { SnackClient, type SnackData } from "./snack-client";

export const metadata = {
  title: "SNACKET — La Copa del Mundo 2026",
  description:
    "Statistik från WhatsApp-snacket: vem snackar mest, vem är tyst, vem delar mest GIFs.",
};

export default function SnackPage() {
  const data = snackStats as SnackData;
  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <Breadcrumbs
          trail={[{ label: "TABELL", href: "/tabell" }, { label: "SNACKET" }]}
        />

        <section className="py-6">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-yellow sm:text-3xl">
            SNACKET
          </h1>
          <p className="mt-2 text-sm text-dim">
            Ligatabell för WhatsApp-gruppen. Vem snackar mest, vem är tystast,
            vem spammar GIFs — och vem skriver romaner mitt i natten. Växla
            mellan hela historiken och bara Copa 26.
          </p>
        </section>

        <SnackClient data={data} />
      </div>
    </main>
  );
}
