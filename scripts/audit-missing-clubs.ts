/**
 * One-off audit: for each WC team in the FIFA top 14, list the players
 * whose domestic club is still unknown. Run with:
 *   npx tsx scripts/audit-missing-clubs.ts
 */

import { PLAYER_CLUBS } from "../src/data/player-clubs";

const AB_BASE = "https://api-manager.aftonbladet.se";
const GAME_ID = 735;

// FIFA top 14 that qualified for WC 2026 (skip Italy at #12).
const TOP_TEAMS: { code: string; teamId: number }[] = [
  { code: "FRA", teamId: 3969 },
  { code: "SPA", teamId: 3972 },
  { code: "ARG", teamId: 4284 },
  { code: "ENG", teamId: 4291 },
  { code: "POR", teamId: 3961 },
  { code: "BRA", teamId: 4286 },
  { code: "NED", teamId: 3970 },
  { code: "MOR", teamId: 4818 },
  { code: "BEL", teamId: 4648 },
  { code: "GER", teamId: 3966 },
  { code: "CRO", teamId: 3964 },
  { code: "COL", teamId: 4643 },
  { code: "SEN", teamId: 4819 },
  { code: "MEX", teamId: 4298 },
];

type RawPlayer = {
  id: number;
  person: { id: number };
  team: { id: number };
  active?: boolean;
};

type RawPerson = { id: number; fullName: string };

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, {
    headers: { "User-Agent": "vmtipset-audit/1.0" },
  });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return (await r.json()) as T;
}

async function main() {
  const players = await getJson<RawPlayer[]>(
    `${AB_BASE}/games/${GAME_ID}/players?limit=2000`,
  );
  const active = players.filter((p) => p.active !== false);

  const teamCodes = new Map(TOP_TEAMS.map((t) => [t.teamId, t.code]));
  const inTop = active.filter((p) => teamCodes.has(p.team.id));

  // Resolve names for top-team players only (much smaller batch).
  const personIds = [...new Set(inTop.map((p) => p.person.id))];
  const personById = new Map<number, RawPerson>();
  for (const id of personIds) {
    try {
      const person = await getJson<RawPerson>(`${AB_BASE}/persons/${id}`);
      personById.set(id, person);
    } catch {
      // skip
    }
  }

  // Group by team, split into known/unknown.
  const byTeam = new Map<string, { known: string[]; missing: string[] }>();
  for (const p of inTop) {
    const code = teamCodes.get(p.team.id)!;
    const name = personById.get(p.person.id)?.fullName ?? `?id${p.person.id}`;
    const key = `ab:p:${p.id}`;
    const cur = byTeam.get(code) ?? { known: [], missing: [] };
    if (PLAYER_CLUBS[key]) {
      cur.known.push(`${name} → ${PLAYER_CLUBS[key]}`);
    } else {
      cur.missing.push(`  ${key.padEnd(13)} ${name}`);
    }
    byTeam.set(code, cur);
  }

  console.log("Coverage in FIFA top 14:");
  for (const { code } of TOP_TEAMS) {
    const t = byTeam.get(code) ?? { known: [], missing: [] };
    const total = t.known.length + t.missing.length;
    console.log(
      `  ${code}: ${t.known.length}/${total} (${t.missing.length} missing)`,
    );
  }
  console.log("\nMissing entries:");
  for (const { code } of TOP_TEAMS) {
    const t = byTeam.get(code) ?? { known: [], missing: [] };
    if (t.missing.length === 0) continue;
    console.log(`\n${code}:`);
    for (const line of t.missing) console.log(line);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
