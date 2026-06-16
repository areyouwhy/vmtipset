import { auth } from "@clerk/nextjs/server";
import { SignUpInButtons } from "./auth-buttons";
import { count, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import { db } from "@/db";
import { teams, users } from "@/db/schema";
import { getPotPayout } from "@/lib/prize-config";

const getStats = unstable_cache(
  async () => {
    const [created] = await db.select({ n: count() }).from(teams);
    const [paying] = await db
      .select({ n: count() })
      .from(teams)
      .innerJoin(users, eq(users.id, teams.ownerUserId))
      .where(eq(users.status, "approved"));
    return { created: created.n, paying: paying.n };
  },
  ["landing-stats"],
  { tags: ["teams", "users"], revalidate: 600 },
);

export default async function Home() {
  const { userId } = await auth();
  const [stats, payout] = await Promise.all([
    getStats().catch(() => ({ created: 0, paying: 0 })),
    getPotPayout().catch(() => null),
  ]);
  const mainPool = payout?.pools.find((p) => p.key === "main_league");
  const topPlaces = mainPool?.places.slice(0, 3) ?? [];

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <header className="flex items-center justify-between border-b border-border pb-3 text-xs uppercase tracking-widest">
          <span className="text-yellow">COPA / 2026</span>
          <span className="text-dim">SOMMAREN 2026</span>
        </header>

        <section className="py-12 sm:py-16">
          <p className="text-sm uppercase tracking-widest text-cyan">
            Vänner, det är dax!
          </p>
          <h1 className="mt-4 text-4xl font-bold uppercase tracking-tight text-yellow sm:text-6xl">
            COPA DEL
            <br />
            MUNDO 2026
          </h1>
          <p className="mt-3 text-sm uppercase tracking-widest text-yellow/80 sm:text-base">
            Må livets liv hända
          </p>

          <div className="mt-6 space-y-3 text-sm text-dim sm:text-base">
            <p>
              Hetsen hittar ni på{" "}
              <a
                href="https://chat.whatsapp.com/LGL6yZKMdtl7GTJKZrEKeX"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:text-yellow"
              >
                WhatsApp
              </a>
              . Här hittar ni resten.
            </p>
            <p>
              Istället för att betala onödiga cash till zionisterna erbjudst
              ett alternativ här.
            </p>
            <p>
              Cashen tar jag, <span className="text-foreground">Ruy</span>,
              hand om. Det är jag som vibeat den här grejen.
            </p>
            <p>
              Checka{" "}
              <Link href="/hur" className="text-cyan hover:text-yellow">
                HUR
              </Link>{" "}
              om du vill fatta hur det funkar och hur jag gjort.
            </p>
          </div>
        </section>

        <div className="space-y-3 border-y border-border py-6">
          {userId ? (
            <Link
              href="/app"
              className="block w-full border border-yellow bg-yellow px-6 py-3 text-center text-sm font-bold uppercase tracking-widest text-black transition hover:opacity-90"
            >
              [ TILL LIGAN → ]
            </Link>
          ) : (
            <SignUpInButtons />
          )}

          {/* Public sections — reachable signed in or out, no login wall. */}
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/tabell"
              className="border border-magenta/60 bg-magenta/5 px-6 py-3 text-center text-sm font-bold uppercase tracking-widest text-magenta transition hover:border-magenta hover:bg-magenta/15"
            >
              [ TABELL ]
            </Link>
            <Link
              href="/live"
              className="flex items-center justify-center gap-2 border border-red/70 bg-red/10 px-6 py-3 text-center text-sm font-bold uppercase tracking-widest text-red transition hover:border-red hover:bg-red/20"
            >
              <span className="animate-pulse" aria-hidden="true">
                ●
              </span>
              LIVE
            </Link>
          </div>
        </div>

        <section className="grid grid-cols-2 gap-0 border-x border-b border-border">
          <div className="border-r border-border p-4">
            <p className="text-[10px] uppercase tracking-widest text-dim">
              SKAPADE LAG
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-yellow">
              {String(stats.created).padStart(3, "0")}
            </p>
          </div>
          <div className="p-4">
            <p className="text-[10px] uppercase tracking-widest text-dim">
              BETALDA LAG
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-green">
              {String(stats.paying).padStart(3, "0")}
            </p>
          </div>
        </section>

        <section className="mt-6 text-xs text-dim">
          <p>──────────────────────────────────</p>
          <div className="grid grid-cols-2 gap-x-6 py-1">
            <div className="space-y-1">
              <p>
                <span className="text-yellow">INSATS</span> &nbsp; 300 KR
              </p>
              <p>
                <span className="text-yellow">BETALA</span> &nbsp; SWISH
              </p>
              <p>
                <span className="text-yellow">URVAL</span> &nbsp; ADMIN APPROVAL
              </p>
              <p>
                <span className="text-yellow">MAX</span> &nbsp; 100 SPELARE
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-yellow">POTT &nbsp; PLATS 1–3</p>
              {topPlaces.length > 0 ? (
                topPlaces.map((p) => (
                  <p key={p.place} className="tabular-nums">
                    <span className="text-foreground">#{p.place}</span>
                    <span className="ml-2 text-yellow">
                      {formatSek(p.amountSek)} KR
                    </span>
                  </p>
                ))
              ) : (
                <p className="text-dim">— SÄTTS NÄR LAGEN GODKÄNTS —</p>
              )}
            </div>
          </div>
          <p>──────────────────────────────────</p>
        </section>

        <section className="mt-8 space-y-2 text-center text-sm">
          <p className="text-yellow font-bold tracking-wider">
            KOMIIIGEEENNNUUU SVERIGE!
          </p>
          <p className="text-cyan font-bold tracking-wider">
            UUUUURUUUGUUUUAYY NOMAAAAAA!
          </p>
          <p className="mt-4 text-xs uppercase tracking-widest text-dim">
            — Ruy
          </p>
        </section>

        <p className="mt-6 flex flex-wrap justify-center gap-4 text-center text-xs">
          <Link href="/vm" className="text-cyan">
            [ VM ]
          </Link>
          <Link href="/tabell" className="text-cyan">
            [ TABELL ]
          </Link>
          <Link href="/hur" className="text-cyan">
            [ HUR FUNKAR DET? ]
          </Link>
        </p>
      </div>
    </main>
  );
}

function formatSek(n: number): string {
  return n.toLocaleString("sv-SE").replace(/ /g, " ");
}
