/**
 * Replacement for the Wikidata-name-search approach.
 *
 * Per-country Wikipedia squad pages (e.g. "Sweden men's national football
 * team") publish a curated "Current squad" wikitable with player name +
 * current club in adjacent cells. Within the country page the names are
 * already disambiguated, so we don't bind Alisson Becker to a politician
 * or Santiago Bueno to a different Bueno.
 *
 * Run with:
 *   npx tsx scripts/fetch-clubs-from-wikipedia.ts
 *
 * Writes a fresh src/data/player-clubs.ts on success. Players with no
 * confident match are simply omitted (callers gracefully fall back to —).
 */

import { writeFileSync } from "node:fs";

const AB = "https://api-manager.aftonbladet.se";
const GAME_ID = 735;
const WP = "https://en.wikipedia.org";

type RawPlayer = {
  id: number;
  person: { id: number };
  team: { id: number };
  active?: boolean;
};
type RawTeam = { id: number; name: string; abbreviation?: string };
type RawPerson = { id: number; fullName: string };

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, {
    headers: { "User-Agent": "vmtipset-club-scrape/1.0" },
  });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return (await r.json()) as T;
}
async function getText(url: string): Promise<string> {
  const r = await fetch(url, {
    headers: { "User-Agent": "vmtipset-club-scrape/1.0" },
  });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return await r.text();
}

function stripAccents(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase();
}

/**
 * Wikipedia article slug per country. Most teams live at
 * "[Country] men's national football team"; a handful diverge.
 */
function wikiSlug(name: string, code: string): string | null {
  const exceptions: Record<string, string> = {
    USA: "United_States_men%27s_national_soccer_team",
    KOR: "South_Korea_national_football_team",
    PRK: "North_Korea_national_football_team",
    IRN: "Iran_national_football_team",
    JPN: "Japan_national_football_team",
    KSA: "Saudi_Arabia_national_football_team",
    QAT: "Qatar_national_football_team",
    UAE: "United_Arab_Emirates_national_football_team",
    UZB: "Uzbekistan_national_football_team",
    SCO: "Scotland_national_football_team",
    NIR: "Northern_Ireland_national_football_team",
    ENG: "England_national_football_team",
    WAL: "Wales_national_football_team",
    AUS: "Australia_men%27s_national_soccer_team",
    NZL: "New_Zealand_men%27s_national_football_team",
    CAN: "Canada_men%27s_national_soccer_team",
    BIH: "Bosnia_and_Herzegovina_national_football_team",
    CIV: "Ivory_Coast_national_football_team",
    COD: "DR_Congo_national_football_team",
    HTI: "Haiti_national_football_team",
    CVE: "Cape_Verde_national_football_team",
    MOR: "Morocco_national_football_team",
    EGY: "Egypt_national_football_team",
    TUR: "Turkey_national_football_team",
    CZE: "Czech_Republic_national_football_team",
    JOR: "Jordan_national_football_team",
    CUW: "Curaçao_national_football_team",
    IRQ: "Iraq_national_football_team",
    ARG: "Argentina_national_football_team",
    FRA: "France_national_football_team",
    GER: "Germany_national_football_team",
    SPA: "Spain_national_football_team",
    BRA: "Brazil_national_football_team",
    POR: "Portugal_national_football_team",
    NED: "Netherlands_national_football_team",
    BEL: "Belgium_national_football_team",
    CRO: "Croatia_national_football_team",
    ITA: "Italy_national_football_team",
    COL: "Colombia_national_football_team",
    URU: "Uruguay_national_football_team",
    PAR: "Paraguay_national_football_team",
    ECU: "Ecuador_national_football_team",
    SUI: "Switzerland_national_football_team",
    SEN: "Senegal_national_football_team",
    ALG: "Algeria_national_football_team",
    TUN: "Tunisia_national_football_team",
    GHA: "Ghana_national_football_team",
    RSA: "South_Africa_national_football_team",
    AUT: "Austria_national_football_team",
    NOR: "Norway_national_football_team",
    SWE: "Sweden_men%27s_national_football_team",
    PAN: "Panama_national_football_team",
    MEX: "Mexico_national_football_team",
  };
  return exceptions[code] ?? null;
}

/**
 * Extract { playerName → club } from the "Current squad" section of a
 * Wikipedia article. Returns null when the section isn't found.
 */
function parseSquad(html: string): Map<string, string> {
  const out = new Map<string, string>();
  const anchor = html.indexOf('id="Current_squad"');
  if (anchor === -1) return out;
  // Squad lives in the first wikitable after the anchor. The window has
  // to be big enough to contain the closing </table>; preliminary squad
  // tables (e.g. Argentina's 55-player WC list) can be 100 KB+.
  const chunk = html.slice(anchor, anchor + 250_000);
  const tableMatch = chunk.match(/<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/);
  if (!tableMatch) return out;
  const tableHtml = tableMatch[1];
  const rows = tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];
  for (const row of rows) {
    // Each squad row has three /wiki/ links in order:
    //   1) position page (Goalkeeper / Defender / Midfielder / Forward)
    //   2) player page
    //   3) club page
    // Pull all three and assume positions 1 (player) and 2 (club) of the
    // resulting list. Skip rows that don't conform (header row, separator).
    const anchors = [
      ...row.matchAll(/<a [^>]*href="(\/wiki\/[^"]+)"[^>]*>([^<]+)<\/a>/g),
    ].map((m) => ({ href: m[1], text: m[2].trim() }));
    if (anchors.length < 3) continue;
    // Drop position-link (href usually contains "Goalkeeper" /
    // "Defender_(association_football)" / "Midfielder" / "Forward_…").
    const filtered = anchors.filter(
      (a) =>
        !/Goalkeeper|Defender|Midfielder|Forward/i.test(a.href) &&
        !/^\d+$/.test(a.text),
    );
    if (filtered.length < 2) continue;
    const player = filtered[0].text;
    const club = filtered[filtered.length - 1].text;
    if (!player || !club) continue;
    out.set(stripAccents(player), club);
  }
  return out;
}

async function main() {
  console.log("Loading Aftonbladet teams + players…");
  const [teams, players] = await Promise.all([
    getJson<RawTeam[]>(`${AB}/games/${GAME_ID}/teams`),
    getJson<RawPlayer[]>(`${AB}/games/${GAME_ID}/players?limit=2000`),
  ]);
  const active = players.filter((p) => p.active !== false);

  // Resolve names per player (1280 fetches but cheap).
  console.log("Resolving player names…");
  const personIds = [...new Set(active.map((p) => p.person.id))];
  const personById = new Map<number, RawPerson>();
  const CONC = 8;
  for (let i = 0; i < personIds.length; i += CONC) {
    const batch = personIds.slice(i, i + CONC);
    const results = await Promise.all(
      batch.map((id) =>
        getJson<RawPerson>(`${AB}/persons/${id}`).catch(() => null),
      ),
    );
    for (const r of results) if (r) personById.set(r.id, r);
    process.stdout.write(`  ${Math.min(i + CONC, personIds.length)}/${personIds.length}\r`);
  }
  console.log();

  // Group players by team and fetch each team's Wikipedia squad table.
  const byTeam = new Map<number, RawPlayer[]>();
  for (const p of active) {
    const arr = byTeam.get(p.team.id) ?? [];
    arr.push(p);
    byTeam.set(p.team.id, arr);
  }

  console.log("Scraping Wikipedia per country…");
  const clubByExternalId: Record<string, string> = {};
  let matched = 0;
  let scanned = 0;
  for (const team of teams) {
    const tEntries = byTeam.get(team.id) ?? [];
    if (tEntries.length === 0) continue;
    const slug = wikiSlug(team.name, team.abbreviation ?? "");
    if (!slug) {
      console.log(`  skip ${team.abbreviation} (no slug)`);
      continue;
    }
    let html: string;
    try {
      html = await getText(`${WP}/wiki/${slug}`);
    } catch (e) {
      console.log(`  ${team.abbreviation}: fetch failed (${(e as Error).message})`);
      continue;
    }
    const squad = parseSquad(html);
    if (squad.size === 0) {
      console.log(`  ${team.abbreviation}: no squad parsed (${slug})`);
      continue;
    }
    let teamMatched = 0;
    for (const p of tEntries) {
      const name = personById.get(p.person.id)?.fullName;
      if (!name) continue;
      scanned++;
      const key = stripAccents(name);
      let club = squad.get(key);
      if (!club) {
        // Try last-name match if full-name lookup misses.
        const last = key.split(" ").slice(-1)[0];
        for (const [wikiName, c] of squad.entries()) {
          if (wikiName.endsWith(last)) {
            club = c;
            break;
          }
        }
      }
      if (club) {
        clubByExternalId[`ab:p:${p.id}`] = club;
        teamMatched++;
        matched++;
      }
    }
    console.log(
      `  ${team.abbreviation}: ${teamMatched}/${tEntries.length} matched (${squad.size} on Wikipedia)`,
    );
  }
  console.log(
    `\nTotal: ${matched}/${scanned} (${((matched / scanned) * 100).toFixed(1)}%)`,
  );

  const ts = `/**
 * Player → domestic club, static lookup.
 *
 * Generated by scripts/fetch-clubs-from-wikipedia.ts on
 * ${new Date().toISOString().slice(0, 10)}.
 *
 * Keys are Aftonbladet player external ids (e.g. "ab:p:248321").
 * Source: per-country Wikipedia "Current squad" wikitables, parsed
 * for each country in the WC 2026 pool. Names are matched case- and
 * accent-insensitively. Players without a confident match are
 * omitted; callers gracefully fall back to — in that case.
 *
 * Override any incorrect entry inline.
 */

export const PLAYER_CLUBS: Record<string, string> = ${JSON.stringify(clubByExternalId, null, 2)};

export function clubFor(externalId: string | null | undefined): string | null {
  if (!externalId) return null;
  return PLAYER_CLUBS[externalId] ?? null;
}
`;
  writeFileSync("src/data/player-clubs.ts", ts);
  console.log(
    `Wrote src/data/player-clubs.ts with ${Object.keys(clubByExternalId).length} entries.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
