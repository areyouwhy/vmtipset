/** One-off: sort all players by current Aftonbladet price desc, take
 *  top 100, count how many still lack a club in PLAYER_CLUBS. */
import { PLAYER_CLUBS } from "../src/data/player-clubs";

const AB = "https://api-manager.aftonbladet.se";

type RawPlayer = { id: number; person: { id: number }; active?: boolean };
type RawValue = { player: { id: number } | number; value: number };
type RawPerson = { id: number; fullName: string };

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { "User-Agent": "vmtipset-audit/1.0" } });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return (await r.json()) as T;
}

async function main() {
  const [players, values] = await Promise.all([
    getJson<RawPlayer[]>(`${AB}/games/735/players?limit=2000`),
    getJson<RawValue[]>(`${AB}/games/735/rounds/1/players`),
  ]);

  const priceById = new Map<number, number>();
  for (const v of values) {
    const id = typeof v.player === "number" ? v.player : v.player.id;
    priceById.set(id, v.value);
  }

  const ranked = players
    .filter((p) => p.active !== false)
    .map((p) => ({ ...p, price: priceById.get(p.id) ?? 0 }))
    .sort((a, b) => b.price - a.price)
    .slice(0, 100);

  // Resolve names for the top 100 + missing
  const missing = ranked.filter((p) => !PLAYER_CLUBS[`ab:p:${p.id}`]);
  const personIds = [...new Set(missing.map((p) => p.person.id))];
  const nameById = new Map<number, string>();
  for (const id of personIds) {
    try {
      const person = await getJson<RawPerson>(`${AB}/persons/${id}`);
      nameById.set(id, person.fullName);
    } catch {}
  }

  console.log(`Top 100 by price (round 1):`);
  console.log(`  with club:    ${ranked.length - missing.length}`);
  console.log(`  WITHOUT club: ${missing.length}`);
  console.log();
  console.log("Missing entries (price · player):");
  for (const m of missing) {
    const name = nameById.get(m.person.id) ?? `?${m.person.id}`;
    console.log(
      `  ${(m.price / 1_000_000).toFixed(1).padStart(5)}M  ab:p:${m.id}  ${name}`,
    );
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
