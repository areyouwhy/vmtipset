/**
 * One-off: build the input file for scripts/label-clubs.html.
 *
 * Pulls every active WC player from Aftonbladet, joins their current
 * price (round 1) + name + national team, attaches the club we have
 * mapped in src/data/player-clubs.ts, and writes the sorted list to
 * scripts/label-clubs-data.json.
 *
 * Run with:
 *   npx tsx scripts/generate-label-data.ts
 *
 * The HTML labeler reads this file directly via fetch().
 */

import { writeFileSync } from "node:fs";
import { PLAYER_CLUBS } from "../src/data/player-clubs";

const AB = "https://api-manager.aftonbladet.se";
const GAME_ID = 735;

type RawPlayer = {
  id: number;
  person: { id: number };
  team: { id: number };
  active?: boolean;
};
type RawTeam = { id: number; abbreviation?: string; name: string };
type RawValue = { player: { id: number } | number; value: number };
type RawPerson = { id: number; fullName: string };

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { "User-Agent": "vmtipset" } });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return (await r.json()) as T;
}

async function main() {
  const [players, teams, values] = await Promise.all([
    getJson<RawPlayer[]>(`${AB}/games/${GAME_ID}/players?limit=2000`),
    getJson<RawTeam[]>(`${AB}/games/${GAME_ID}/teams`),
    getJson<RawValue[]>(`${AB}/games/${GAME_ID}/rounds/1/players`),
  ]);
  const teamByExt = new Map(teams.map((t) => [t.id, t]));
  const priceById = new Map<number, number>();
  for (const v of values) {
    const id = typeof v.player === "number" ? v.player : v.player.id;
    priceById.set(id, v.value);
  }

  const active = players.filter((p) => p.active !== false);
  console.log(`Resolving names for ${active.length} players…`);
  const personIds = [...new Set(active.map((p) => p.person.id))];
  const nameById = new Map<number, string>();
  const CONC = 8;
  for (let i = 0; i < personIds.length; i += CONC) {
    const batch = personIds.slice(i, i + CONC);
    const results = await Promise.all(
      batch.map((id) =>
        getJson<RawPerson>(`${AB}/persons/${id}`).catch(() => null),
      ),
    );
    for (const r of results) if (r) nameById.set(r.id, r.fullName);
  }

  const rows = active
    .map((p) => {
      const team = teamByExt.get(p.team.id);
      return {
        externalId: `ab:p:${p.id}`,
        name: nameById.get(p.person.id) ?? `?${p.person.id}`,
        countryCode: (team?.abbreviation ?? "").toUpperCase(),
        countryName: team?.name ?? "",
        priceSek: priceById.get(p.id) ?? 0,
        currentClub: PLAYER_CLUBS[`ab:p:${p.id}`] ?? null,
      };
    })
    .sort((a, b) => b.priceSek - a.priceSek);

  // De-dup the club list for the labeler's autocomplete.
  const knownClubs = [...new Set(Object.values(PLAYER_CLUBS))].sort((a, b) =>
    a.localeCompare(b, "sv"),
  );

  const out = {
    generatedAt: new Date().toISOString(),
    players: rows,
    knownClubs,
  };
  writeFileSync("scripts/label-clubs-data.json", JSON.stringify(out, null, 2));
  console.log(
    `Wrote scripts/label-clubs-data.json — ${rows.length} players, ${knownClubs.length} known clubs.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
