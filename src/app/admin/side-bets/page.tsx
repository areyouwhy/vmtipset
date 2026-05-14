import Link from "next/link";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { sideBets } from "@/db/schema";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { isAdmin } from "@/lib/auth";
import { CreateSideBetForm } from "./create-form";
import { SideBetCard } from "./bet-card";

export const dynamic = "force-dynamic";

export default async function AdminSideBetsPage() {
  if (!(await isAdmin())) redirect("/app");

  const all = await db.select().from(sideBets).orderBy(asc(sideBets.createdAt));

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <Breadcrumbs
          trail={[
            { label: "ADMIN", href: "/admin" },
            { label: "SIDOSPEL" },
          ]}
        />

        <section className="py-6">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-yellow">
            SIDOSPEL
          </h1>
          <p className="mt-2 text-sm text-dim">
            Frågor utan poäng eller pengar. Du skriver in resultatet i fri
            text när det är dags. Visas på{" "}
            <Link href="/side-bets" className="text-cyan">
              /side-bets
            </Link>
            .
          </p>
        </section>

        <section className="border border-border p-5">
          <p className="text-[10px] uppercase tracking-widest text-dim">
            NYTT SIDOSPEL
          </p>
          <CreateSideBetForm />
        </section>

        <section className="mt-8">
          <h2 className="text-xs uppercase tracking-widest text-dim">
            ALLA ({all.length})
          </h2>
          {all.length === 0 ? (
            <p className="mt-3 border border-border p-4 text-sm text-dim">
              Inget skapat ännu.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {all.map((b) => (
                <li key={b.id}>
                  <SideBetCard bet={b} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
