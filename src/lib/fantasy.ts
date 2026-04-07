import { put, list, del, head } from '@vercel/blob';
import { API_BASE, RULESET_ID, STARTING_BUDGET, TEAM_SIZE } from './constants';

// ---- Types ----

export interface FantasyTeam {
  teamId: string;
  teamName: string;
  pinHash: string;
  status: 'pending' | 'approved' | 'rejected';
  formationId: number;
  players: { playerId: number; slotIndex: number; isCaptain: boolean }[];
  budget: number;
  createdAt: string;
  updatedAt: string;
}

export interface LeagueConfig {
  leagueName: string;
  startingBudget: number;
  teamSize: number;
  transferFeePercent: number;
  captainBonusOnlyPositive: boolean;
  bankInterestPercent: number;
  maxPlayersPerClub: number;
  entryFee: number;
  prizesSplit: number[];
  registrationOpen: boolean;
  currentGameId: string;
}

const DEFAULT_CONFIG: LeagueConfig = {
  leagueName: 'Copa del Mundo 2026',
  startingBudget: 50_000_000,
  teamSize: 11,
  transferFeePercent: 1,
  captainBonusOnlyPositive: true,
  bankInterestPercent: 1,
  maxPlayersPerClub: 4,
  entryFee: 300,
  prizesSplit: [85, 10, 5],
  registrationOpen: true,
  currentGameId: '731',
};

// ---- Blob helpers ----

const encoder = new TextEncoder();

export async function getTeam(teamId: string): Promise<FantasyTeam | null> {
  try {
    const metadata = await head(`teams/${teamId}.json`);
    const res = await fetch(metadata.url);
    if (!res.ok) return null;
    return await res.json() as FantasyTeam;
  } catch {
    return null;
  }
}

export async function putTeam(team: FantasyTeam): Promise<void> {
  await put(`teams/${team.teamId}.json`, JSON.stringify(team), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function listTeams(): Promise<FantasyTeam[]> {
  const { blobs } = await list({ prefix: 'teams/' });
  const teams: FantasyTeam[] = [];
  for (const blob of blobs) {
    try {
      const res = await fetch(blob.url);
      if (res.ok) teams.push(await res.json());
    } catch { /* skip corrupted */ }
  }
  return teams;
}

export async function teamExists(teamId: string): Promise<boolean> {
  try {
    await head(`teams/${teamId}.json`);
    return true;
  } catch {
    return false;
  }
}

// ---- League config helpers ----

export async function getLeagueConfig(): Promise<LeagueConfig> {
  try {
    const metadata = await head('league/config.json');
    const res = await fetch(metadata.url);
    if (!res.ok) return { ...DEFAULT_CONFIG };
    return { ...DEFAULT_CONFIG, ...(await res.json()) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function putLeagueConfig(config: LeagueConfig): Promise<void> {
  await put('league/config.json', JSON.stringify(config), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

// ---- Auth helpers ----

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[åä]/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function hashPin(pin: string): Promise<string> {
  const data = encoder.encode(pin);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function signSession(teamId: string, secret: string): Promise<string> {
  const payload = JSON.stringify({ teamId, ts: Date.now() });
  const payloadB64 = btoa(payload);
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64));
  const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${payloadB64}.${sigHex}`;
}

export async function verifySession(cookie: string, secret: string): Promise<string | null> {
  try {
    const [payloadB64, sigHex] = cookie.split('.');
    if (!payloadB64 || !sigHex) return null;
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const sigBytes = new Uint8Array(sigHex.match(/.{2}/g)!.map(h => parseInt(h, 16)));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(payloadB64));
    if (!valid) return null;
    const payload = JSON.parse(atob(payloadB64));
    // Expire after 30 days
    if (Date.now() - payload.ts > 30 * 24 * 60 * 60 * 1000) return null;
    return payload.teamId;
  } catch {
    return null;
  }
}

export function getSessionCookie(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/copa-session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function makeSetCookie(value: string): string {
  return `copa-session=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${30 * 24 * 60 * 60}`;
}

export function makeClearCookie(): string {
  return 'copa-session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0';
}

// ---- Validation ----

let cachedRuleset: any = null;

async function getRuleset(): Promise<any> {
  if (cachedRuleset) return cachedRuleset;
  const res = await fetch(`${API_BASE}/rulesets/${RULESET_ID}`);
  if (!res.ok) return null;
  cachedRuleset = await res.json();
  return cachedRuleset;
}

export async function validateTeamLineup(
  formationId: number,
  players: { playerId: number; slotIndex: number; isCaptain: boolean }[],
  playerValues: Map<number, { value: number; position: number }>,
  budget?: number,
): Promise<{ valid: boolean; error?: string }> {
  if (players.length !== TEAM_SIZE) {
    return { valid: false, error: `Laget måste ha exakt ${TEAM_SIZE} spelare` };
  }

  const captains = players.filter(p => p.isCaptain);
  if (captains.length !== 1) {
    return { valid: false, error: 'Laget måste ha exakt en kapten' };
  }

  // Check for duplicate players
  const ids = new Set(players.map(p => p.playerId));
  if (ids.size !== players.length) {
    return { valid: false, error: 'Samma spelare kan inte väljas flera gånger' };
  }

  // Validate formation
  const ruleset = await getRuleset();
  if (!ruleset) return { valid: false, error: 'Kunde inte ladda regler' };

  const formation = (ruleset.formations || []).find((f: any) => f.id === formationId);
  if (!formation) return { valid: false, error: 'Ogiltig formation' };

  if (formation.slots.length !== TEAM_SIZE) {
    return { valid: false, error: 'Formationen matchar inte lagstorlek' };
  }

  // Check positions match formation slots
  const slotPosCounts: Record<number, number> = {};
  for (const slot of formation.slots) {
    const posId = slot.position?.id ?? slot.position;
    slotPosCounts[posId] = (slotPosCounts[posId] || 0) + 1;
  }

  const playerPosCounts: Record<number, number> = {};
  for (const p of players) {
    const info = playerValues.get(p.playerId);
    if (!info) return { valid: false, error: `Spelare ${p.playerId} hittades inte` };
    playerPosCounts[info.position] = (playerPosCounts[info.position] || 0) + 1;
  }

  for (const pos in slotPosCounts) {
    if ((playerPosCounts[pos] || 0) !== slotPosCounts[pos]) {
      return { valid: false, error: 'Spelarna matchar inte formationen' };
    }
  }

  // Check budget
  let totalCost = 0;
  for (const p of players) {
    const info = playerValues.get(p.playerId);
    if (info) totalCost += info.value;
  }

  const maxBudget = budget ?? STARTING_BUDGET;
  if (totalCost > maxBudget) {
    return { valid: false, error: `Budgeten överskriden: ${(totalCost / 1_000_000).toFixed(2)}M / ${maxBudget / 1_000_000}M` };
  }

  return { valid: true };
}
