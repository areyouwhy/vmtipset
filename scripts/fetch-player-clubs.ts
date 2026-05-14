/**
 * One-off script: build src/data/player-clubs.ts from Wikidata.
 *
 * For each WC 2026 player in Aftonbladet's player list, search Wikidata
 * by full name, grab the first football-player result, then read
 *   P54 (member of sports team) — preferring statements with no end date
 *   else the one with the latest start date
 * and resolve the team QID to its English label.
 *
 * Run with:
 *   npx tsx scripts/fetch-player-clubs.ts
 *
 * The output is keyed by Aftonbladet player externalId (the same value
 * stored as players.externalId in our DB, e.g. "ab:p:248321").
 */

import { writeFileSync } from "node:fs";

const GAME_ID = 735;
const AB_BASE = "https://api-manager.aftonbladet.se";
const WD_BASE = "https://www.wikidata.org/w/api.php";

const CONCURRENCY = 1;
const DELAY_MS = 100; // wikidata wbsearchentities is ~25 req/s comfortable

type RawPlayer = {
  id: number;
  person: { id: number };
  team: { id: number };
  active?: boolean;
};

type RawPerson = {
  id: number;
  fullName: string;
};

type WdSearchResult = {
  search: { id: string; label: string; description?: string }[];
};

type WdEntities = {
  entities: Record<
    string,
    {
      claims?: Record<
        string,
        {
          mainsnak: {
            snaktype: string;
            datavalue?: { value: { id?: string } };
          };
          qualifiers?: Record<
            string,
            { datavalue?: { value: { time?: string } } }[]
          >;
        }[]
      >;
      labels?: Record<string, { value: string }>;
    }
  >;
};

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getJson<T>(url: string, retries = 4): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, {
      headers: { "User-Agent": "vmtipset-club-fetch/1.0 (one-off)" },
    });
    if (res.status === 429) {
      // Respect Retry-After if present, else exponential backoff.
      const ra = Number(res.headers.get("retry-after") ?? "0");
      await sleep(ra > 0 ? ra * 1000 : 500 * 2 ** attempt);
      continue;
    }
    if (!res.ok) throw new Error(`${url} → ${res.status}`);
    return (await res.json()) as T;
  }
  throw new Error(`${url} → still 429 after ${retries} retries`);
}

let errCount = 0;
async function findClub(name: string): Promise<string | null> {
  // 1. search wikidata by name
  const sUrl = `${WD_BASE}?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&format=json&type=item&limit=5&origin=*`;
  let s: WdSearchResult;
  try {
    s = await getJson<WdSearchResult>(sUrl);
  } catch (e) {
    if (errCount++ < 3) console.error(`\nsearch fail for ${name}:`, (e as Error).message);
    return null;
  }
  const candidate = s.search.find((r) =>
    /football|soccer|footballer/i.test(r.description ?? ""),
  ) ?? s.search[0];
  if (!candidate) return null;

  // 2. fetch the person entity, find current P54
  const eUrl = `${WD_BASE}?action=wbgetentities&ids=${candidate.id}&format=json&props=claims&languages=en&origin=*`;
  let e: WdEntities;
  try {
    e = await getJson<WdEntities>(eUrl);
  } catch {
    return null;
  }
  const ent = e.entities[candidate.id];
  const teams = ent?.claims?.P54 ?? [];
  let currentTeamId: string | null = null;
  let latestTeamId: string | null = null;
  let latestStart = "";
  for (const t of teams) {
    if (t.mainsnak.snaktype !== "value") continue;
    const qid = t.mainsnak.datavalue?.value.id;
    if (!qid) continue;
    const qual = t.qualifiers ?? {};
    const hasEnd = !!qual.P582;
    const start =
      qual.P580?.[0]?.datavalue?.value?.time ?? "";
    if (!hasEnd) {
      currentTeamId = qid;
      // keep iterating in case there are multiple "current" entries — last
      // one tends to be the most recent in Wikidata's source order
    }
    if (start > latestStart) {
      latestStart = start;
      latestTeamId = qid;
    }
  }
  const teamQid = currentTeamId ?? latestTeamId;
  if (!teamQid) return null;

  // 3. resolve to label
  const lUrl = `${WD_BASE}?action=wbgetentities&ids=${teamQid}&format=json&props=labels&languages=en&origin=*`;
  try {
    const l = await getJson<WdEntities>(lUrl);
    return l.entities[teamQid]?.labels?.en?.value ?? null;
  } catch {
    return null;
  }
}

async function main() {
  console.log("Fetching players from Aftonbladet…");
  const players = await getJson<RawPlayer[]>(
    `${AB_BASE}/games/${GAME_ID}/players?limit=2000`,
  );
  const active = players.filter((p) => p.active !== false);
  console.log(`  ${active.length} active players`);

  console.log("Fetching persons (names) in parallel…");
  const personIds = [...new Set(active.map((p) => p.person.id))];
  const personById = new Map<number, RawPerson>();
  for (let i = 0; i < personIds.length; i += CONCURRENCY) {
    const batch = personIds.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((id) =>
        getJson<RawPerson>(`${AB_BASE}/persons/${id}`).catch(() => null),
      ),
    );
    for (const r of results) if (r) personById.set(r.id, r);
    process.stdout.write(`  ${Math.min(i + CONCURRENCY, personIds.length)}/${personIds.length}\r`);
  }
  console.log(`\n  resolved ${personById.size} persons`);

  console.log("Resolving clubs from Wikidata… (serial w/ backoff, ~15 min)");
  const clubByExternalId: Record<string, string> = {};
  const unresolved: string[] = [];
  for (let i = 0; i < active.length; i++) {
    const p = active[i];
    const person = personById.get(p.person.id);
    if (!person) continue;
    try {
      const club = await findClub(person.fullName);
      const key = `ab:p:${p.id}`;
      if (club) clubByExternalId[key] = club;
      else unresolved.push(person.fullName);
    } catch (e) {
      unresolved.push(`${person.fullName} (${(e as Error).message})`);
    }
    if ((i + 1) % 25 === 0 || i === active.length - 1) {
      process.stdout.write(
        `  ${i + 1}/${active.length}  matched=${Object.keys(clubByExternalId).length}\r`,
      );
    }
    await sleep(DELAY_MS);
  }
  console.log();

  const ts = `/**
 * Player → domestic club, static lookup.
 *
 * Built once from Wikidata's P54 (member of sports team) by
 * scripts/fetch-player-clubs.ts. Keys are Aftonbladet player external
 * ids (the same value stored as players.externalId, e.g. "ab:p:248321").
 *
 * Match rate is roughly ~80 % — common names occasionally resolve to the
 * wrong person. Override individual entries inline as you spot them.
 *
 * Generated: ${new Date().toISOString().slice(0, 10)}
 */

export const PLAYER_CLUBS: Record<string, string> = ${JSON.stringify(clubByExternalId, null, 2)};

export function clubFor(externalId: string | null | undefined): string | null {
  if (!externalId) return null;
  return PLAYER_CLUBS[externalId] ?? null;
}
`;

  writeFileSync("src/data/player-clubs.ts", ts);
  console.log(`Wrote src/data/player-clubs.ts — ${Object.keys(clubByExternalId).length} matched, ${unresolved.length} unresolved`);
  if (unresolved.length > 0) {
    console.log("First unresolved names:", unresolved.slice(0, 20).join(", "));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
