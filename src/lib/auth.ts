import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { teams, users, type User } from "@/db/schema";
import { teamSlug } from "./team-slug";

export async function getOrCreateDbUser(): Promise<User | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (existing.length > 0) return existing[0];

  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const email =
    clerkUser.primaryEmailAddress?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress ??
    "";
  const displayName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
    clerkUser.username ||
    null;

  const [created] = await db
    .insert(users)
    .values({
      id: userId,
      email,
      displayName,
      status: "pending",
    })
    .returning();

  return created;
}

/**
 * Read-only auth snapshot for things like the global ⌘K palette. Does NOT
 * create a users row (unlike getOrCreateDbUser). Cheap enough to call from
 * the root layout on every request.
 */
export type ViewerAuth = {
  signedIn: boolean;
  approved: boolean;
  isAdmin: boolean;
  myTeamSlug: string | null;
};

export async function getViewerAuth(): Promise<ViewerAuth> {
  const { userId } = await auth();
  if (!userId) {
    return { signedIn: false, approved: false, isAdmin: false, myTeamSlug: null };
  }

  // Called from the root layout on every signed-in request — must NEVER
  // throw, or the whole app crashes when Neon is unreachable. Both DB
  // reads degrade to "unknown" (signed-in but treat as not-approved,
  // no team) so users still see a working layout.
  const [u, team, admin] = await Promise.all([
    db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .then((r) => r[0] ?? null)
      .catch(() => null),
    db
      .select({ name: teams.name })
      .from(teams)
      .where(eq(teams.ownerUserId, userId))
      .limit(1)
      .then((r) => r[0] ?? null)
      .catch(() => null),
    isAdmin(),
  ]);

  return {
    signedIn: true,
    approved: u?.status === "approved",
    isAdmin: admin,
    myTeamSlug: team ? teamSlug(team.name) : null,
  };
}

export async function isAdmin(): Promise<boolean> {
  // .trim() guards against stray whitespace/newlines in the env var — easy
  // to introduce when piping the value through the Vercel CLI.
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail) return false;

  const clerkUser = await currentUser();
  if (!clerkUser) return false;

  const email = (
    clerkUser.primaryEmailAddress?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress ??
    ""
  ).toLowerCase();

  return email === adminEmail;
}
