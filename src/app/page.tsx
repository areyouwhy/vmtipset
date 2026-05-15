import { auth } from "@clerk/nextjs/server";
import { SignUpInButtons } from "./auth-buttons";
import { count, eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { teams, users } from "@/db/schema";

async function getStats() {
  const [created] = await db.select({ n: count() }).from(teams);
  const [paying] = await db
    .select({ n: count() })
    .from(teams)
    .innerJoin(users, eq(users.id, teams.ownerUserId))
    .where(eq(users.status, "approved"));
  return { created: created.n, paying: paying.n };
}

export default async function Home() {
  const [{ userId }, stats] = await Promise.all([auth(), getStats()]);

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
              Hetsen hittar ni på <span className="text-foreground">WhatsApp</span>.
              Här hittar ni resten.
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

        <section className="mt-6 space-y-1 text-xs text-dim">
          <p>──────────────────────────────────</p>
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
