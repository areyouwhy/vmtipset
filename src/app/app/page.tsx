import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { db } from "@/db";
import { teams } from "@/db/schema";
import { getOrCreateDbUser, isAdmin } from "@/lib/auth";
import { CreateTeamForm } from "./create-team-form";
import { PendingPanel } from "./pending-panel";

export default async function AppPage() {
  const user = await getOrCreateDbUser();
  if (!user) redirect("/");

  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.ownerUserId, user.id))
    .limit(1);

  const admin = await isAdmin();
  const handle = user.displayName || user.email.split("@")[0];

  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <header className="flex items-center justify-between border-b border-border pb-3 text-xs uppercase tracking-widest">
          <span className="text-yellow">COPA / APP</span>
          <div className="flex items-center gap-4">
            {admin && (
              <a href="/admin" className="text-cyan">
                ADMIN
              </a>
            )}
            <SignOutButton><button className="text-dim hover:text-red">LOGGA UT</button></SignOutButton>
          </div>
        </header>

        <section className="py-6">
          <p className="text-[10px] uppercase tracking-widest text-dim">
            INLOGGAD SOM
          </p>
          <p className="mt-1 text-lg text-foreground">
            <span className="text-yellow">{">"} </span>
            {handle}
          </p>
        </section>

        <div className="space-y-6 border-t border-border pt-6">
          {!team && <CreateTeamForm />}
          {team && user.status === "pending" && (
            <PendingPanel team={team} email={user.email} />
          )}
          {team && user.status === "approved" && (
            <ApprovedPanel teamName={team.name} />
          )}
          {user.status === "rejected" && <RejectedPanel />}
        </div>
      </div>
    </main>
  );
}

function ApprovedPanel({ teamName }: { teamName: string }) {
  return (
    <section className="border border-green p-5">
      <p className="text-[10px] uppercase tracking-widest text-green">
        STATUS / GODKÄND
      </p>
      <h2 className="mt-2 text-2xl font-bold uppercase tracking-tight text-foreground">
        DU ÄR MED I LIGAN
      </h2>
      <p className="mt-3 text-sm text-dim">
        <span className="text-yellow">{teamName}</span> är godkänt och
        betalningen är registrerad. Spelet drar igång inom kort — mer info
        kommer här när det är dags att bygga laget.
      </p>
    </section>
  );
}

function RejectedPanel() {
  return (
    <section className="border border-red p-5">
      <p className="text-[10px] uppercase tracking-widest text-red">
        STATUS / AVVISAD
      </p>
      <h2 className="mt-2 text-xl font-bold uppercase tracking-tight">
        ANMÄLAN AVVISAD
      </h2>
      <p className="mt-3 text-sm text-dim">
        Hör av dig till Ruy om du tror det är ett misstag.
      </p>
    </section>
  );
}
