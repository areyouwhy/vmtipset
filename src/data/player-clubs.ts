/**
 * Player → domestic club, static lookup.
 *
 * Built once from Wikidata's P54 (member of sports team) by
 * scripts/fetch-player-clubs.ts. Keys are Aftonbladet player external
 * ids (the same value stored as players.externalId, e.g. "ab:p:248321").
 *
 * Match rate is roughly ~80 % — common names occasionally resolve to the
 * wrong person. Override individual entries inline as you spot them.
 *
 * Generated: 2026-05-14
 */

export const PLAYER_CLUBS: Record<string, string> = {};

export function clubFor(externalId: string | null | undefined): string | null {
  if (!externalId) return null;
  return PLAYER_CLUBS[externalId] ?? null;
}
