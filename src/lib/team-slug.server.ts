import "server-only";
import { db } from "@/db";
import { teams } from "@/db/schema";
import { teamSlug } from "./team-slug";

/**
 * Resolve a slug back to a team row. Loads all team names and re-slugifies;
 * cheap at this user count (~50–100 teams). Also accepts a raw UUID as a
 * fallback for old/external links.
 */
export async function findTeamBySlug(slug: string) {
  const all = await db.select().from(teams);
  const byId = all.find((t) => t.id === slug);
  if (byId) return byId;
  const matches = all.filter((t) => teamSlug(t.name) === slug);
  if (matches.length === 1) return matches[0];
  return null;
}
