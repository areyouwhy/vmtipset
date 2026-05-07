import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, teams } from "@/db/schema";
import { isAdmin } from "@/lib/auth";
import { UserRow } from "./user-row";

export default async function AdminPage() {
  if (!(await isAdmin())) redirect("/app");

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      status: users.status,
      paidAt: users.paidAt,
      approvedAt: users.approvedAt,
      createdAt: users.createdAt,
      teamName: teams.name,
    })
    .from(users)
    .leftJoin(teams, eq(teams.ownerUserId, users.id))
    .orderBy(users.createdAt);

  const pending = rows.filter((r) => r.status === "pending");
  const approved = rows.filter((r) => r.status === "approved");
  const rejected = rows.filter((r) => r.status === "rejected");

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <header className="flex items-center justify-between border-b border-border pb-3 text-xs uppercase tracking-widest">
          <span className="text-yellow">COPA / ADMIN</span>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/admin/rounds" className="text-cyan">
              RONDER
            </Link>
            <Link href="/admin/bets" className="text-cyan">
              BET
            </Link>
            <Link href="/admin/side-bets" className="text-cyan">
              SIDOSPEL
            </Link>
            <Link href="/admin/players" className="text-cyan">
              SPELARE
            </Link>
            <Link href="/admin/config" className="text-cyan">
              CONFIG
            </Link>
            <Link href="/admin/data" className="text-cyan">
              DATA
            </Link>
            <Link href="/app" className="text-cyan">
              ← APP
            </Link>
          </div>
        </header>

        <section className="py-6">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-yellow">
            ANVÄNDARHANTERING
          </h1>
          <p className="mt-2 text-sm text-dim">
            Matcha Swish-betalning mot e-postadress i meddelandet och godkänn.
          </p>
        </section>

        <div className="space-y-8 border-t border-border pt-6">
          <Section
            title="VÄNTANDE"
            rows={pending}
            accent="text-yellow"
          />
          <Section
            title="GODKÄNDA"
            rows={approved}
            accent="text-green"
          />
          {rejected.length > 0 && (
            <Section
              title="AVVISADE"
              rows={rejected}
              accent="text-red"
            />
          )}
        </div>
      </div>
    </main>
  );
}

function Section({
  title,
  rows,
  accent,
}: {
  title: string;
  rows: Array<{
    id: string;
    email: string;
    displayName: string | null;
    status: "pending" | "approved" | "rejected";
    paidAt: Date | null;
    approvedAt: Date | null;
    createdAt: Date;
    teamName: string | null;
  }>;
  accent: string;
}) {
  return (
    <section>
      <h2
        className={`flex items-baseline justify-between text-xs uppercase tracking-widest ${accent}`}
      >
        <span>{title}</span>
        <span className="tabular-nums">
          {String(rows.length).padStart(3, "0")}
        </span>
      </h2>
      {rows.length === 0 ? (
        <p className="mt-2 border border-border px-3 py-2 text-xs text-dim">
          — TOMT —
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-border border border-border">
          {rows.map((row) => (
            <UserRow key={row.id} row={row} />
          ))}
        </ul>
      )}
    </section>
  );
}
