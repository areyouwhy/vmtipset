/**
 * Vercel Edge Config wrapper for read-mostly config we want to keep off
 * the database. Reads are free from any region; writes go via Vercel's
 * REST API and need a personal API token.
 *
 * One-time setup (Vercel dashboard, free tier):
 *   1. Storage → Edge Config → Create. Pick the project's region.
 *   2. Connect the store to this project. That auto-creates the
 *      `EDGE_CONFIG` env var (read URL with token).
 *   3. Set `EDGE_CONFIG_ID` to the store id (visible in the dashboard URL).
 *   4. Create a personal Vercel API token at vercel.com/account/tokens
 *      and store it as `VERCEL_API_TOKEN`.
 *
 * Without those env vars, both read and write are no-ops — callers fall
 * back to whatever they were doing before (typically a DB query).
 */

import { createClient, type EdgeConfigClient } from "@vercel/edge-config";

let cached: EdgeConfigClient | null | undefined;

/**
 * Resolve the Edge Config connection URL. Standard convention is
 * `EDGE_CONFIG`, but when a project has multiple stores connected Vercel
 * names each env var after the store id (`ecfg_<hash>`). Accept either.
 */
function resolveConnectionUrl(): string | null {
  if (process.env.EDGE_CONFIG) return process.env.EDGE_CONFIG;
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith("ecfg_") && typeof v === "string" && v.startsWith("https://")) {
      return v;
    }
  }
  return null;
}

function client(): EdgeConfigClient | null {
  if (cached !== undefined) return cached;
  const url = resolveConnectionUrl();
  cached = url ? createClient(url) : null;
  return cached;
}

export async function readEdgeConfig<T>(key: string): Promise<T | null> {
  const c = client();
  if (!c) return null;
  try {
    const v = await c.get<T>(key);
    return v ?? null;
  } catch {
    return null;
  }
}

/**
 * Push a value into Edge Config via Vercel's REST API. No-ops (returns
 * false) if the write credentials aren't set, which is fine for local /
 * preview where we don't want write side-effects.
 */
export async function writeEdgeConfig(
  key: string,
  value: unknown,
): Promise<boolean> {
  const id = process.env.EDGE_CONFIG_ID;
  const token = process.env.VERCEL_API_TOKEN;
  if (!id || !token) return false;
  try {
    const res = await fetch(
      `https://api.vercel.com/v1/edge-config/${id}/items`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: [{ operation: "upsert", key, value }],
        }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}
