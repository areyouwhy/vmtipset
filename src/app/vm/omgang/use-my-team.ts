"use client";

import { useSyncExternalStore } from "react";

/**
 * Shared "which team is mine" state for the /vm/omgang page. The signed-in
 * team (resolved server-side) wins; otherwise a browser-remembered pick in
 * localStorage. Backed by useSyncExternalStore so every subscriber (the
 * DITT LÄGE strip, the position chart) updates the moment a pick happens.
 */

const STORAGE_KEY = "copa:my-team-id";

const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function read(): string | null {
  return window.localStorage.getItem(STORAGE_KEY);
}

export function pickMyTeam(id: string): void {
  window.localStorage.setItem(STORAGE_KEY, id);
  for (const cb of listeners) cb();
}

/** SSR renders null (no localStorage); resolves after hydration. */
export function useMyTeamId(authedTeamId: string | null): string | null {
  const storedId = useSyncExternalStore(subscribe, read, () => null);
  return authedTeamId ?? storedId;
}
