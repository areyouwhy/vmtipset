import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
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
          <h1 className="text-4xl font-bold uppercase tracking-tight text-yellow sm:text-6xl">
            LA COPA
            <br />
            DEL MUNDO
          </h1>
          <p className="mt-6 max-w-md text-sm text-dim sm:text-base">
            Vänner. Lag. Pengar.
            <br />
            En liga byggd kring fotbolls-VM 2026.
            <br />
            Bygg ditt drömlag. Jaga toppen. Vinn potten.
          </p>
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
            <div className="flex flex-col gap-3 sm:flex-row">
              <SignUpButton mode="modal">
                <button className="flex-1 border border-yellow bg-yellow px-6 py-3 text-sm font-bold uppercase tracking-widest text-black transition hover:opacity-90">[ SKAPA KONTO ]</button>
              </SignUpButton>
              <SignInButton mode="modal">
                <button className="flex-1 border border-border px-6 py-3 text-sm font-bold uppercase tracking-widest text-foreground transition hover:border-cyan hover:text-cyan">[ LOGGA IN ]</button>
              </SignInButton>
            </div>
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
          <p>──────────────────────────────────</p>
        </section>
      </div>
    </main>
  );
}
