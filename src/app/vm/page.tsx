import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { getGroupsView, getKnockoutView } from "@/lib/wc-tournament";
import { getAllNations } from "@/lib/nation-data";
import { getAllClubs } from "@/lib/clubs";

export const dynamic = "force-dynamic";

export default async function VMHomePage() {
  const [groups, knockout, nations, clubs] = await Promise.all([
    getGroupsView(),
    getKnockoutView(),
    getAllNations(),
    getAllClubs(),
  ]);
  const groupMatchCount = groups.reduce((n, g) => n + g.matches.length, 0);
  const knockoutMatchCount = knockout.stages.reduce(
    (n, s) => n + s.matches.length,
    0,
  );

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <Breadcrumbs trail={[{ label: "VM" }]} />

        <section className="py-6">
          <h1 className="text-3xl font-bold uppercase tracking-tight text-yellow sm:text-4xl">
            VM 2026
          </h1>
          <p className="mt-2 text-sm text-dim">
            Allt om Fotbolls-VM 2026 — gruppspel, slutspel, landslag och
            spelare. Data live från Aftonbladet.
          </p>
        </section>

        <nav className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <HubCard
            href="/vm/gruppspel"
            title="GRUPPSPEL"
            subtitle={`${groups.length} grupper · ${groupMatchCount} matcher`}
            blurb="Tabeller, matcher och resultat per grupp A–L."
            accent="cyan"
          />
          <HubCard
            href="/vm/slutspel"
            title="SLUTSPEL"
            subtitle={`${knockoutMatchCount} matcher`}
            blurb="Sextondelsfinal till final — trädet uppdateras allt eftersom."
            accent="yellow"
          />
          <HubCard
            href="/vm/gruppspel"
            title="LANDSLAG"
            subtitle={`${nations.length} lag`}
            blurb="Alla truppers dyrastes startelva, FIFA-rank och pris."
            accent="cyan"
          />
          <HubCard
            href="/spelare"
            title="SPELARE"
            subtitle="Alla aktiva"
            blurb="Filtrera på position, land och pris. Klicka för rondvärden."
            accent="cyan"
          />
          <HubCard
            href="/klubblag"
            title="KLUBBLAG"
            subtitle={`${clubs.length} klubbar`}
            blurb="Se vilka VM-spelare som spelar i varje inhemsk klubb."
            accent="cyan"
          />
        </nav>
      </div>
    </main>
  );
}

function HubCard({
  href,
  title,
  subtitle,
  blurb,
  accent,
}: {
  href: string;
  title: string;
  subtitle: string;
  blurb: string;
  accent: "cyan" | "yellow";
}) {
  const ring =
    accent === "yellow"
      ? "border-yellow hover:bg-yellow/5"
      : "border-border hover:border-cyan hover:bg-cyan/5";
  const titleColor = accent === "yellow" ? "text-yellow" : "text-foreground";
  return (
    <Link
      href={href}
      className={`block border p-4 transition ${ring}`}
    >
      <p className={`text-lg font-bold uppercase tracking-tight ${titleColor}`}>
        {title}
      </p>
      <p className="mt-0.5 text-[10px] uppercase tracking-widest text-cyan">
        {subtitle}
      </p>
      <p className="mt-2 text-xs text-dim">{blurb}</p>
    </Link>
  );
}
