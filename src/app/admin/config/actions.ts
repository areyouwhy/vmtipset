"use server";

import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/auth";
import {
  savePoolAllocations,
  savePoolPlaces,
  type SaveResult,
} from "@/lib/prize-config";
import { pctToBps } from "@/lib/prizes";
import type { PrizePoolKey } from "@/db/schema";

async function requireAdmin() {
  if (!(await isAdmin())) throw new Error("Forbidden");
}

export async function savePoolAllocationsAction(
  _prev: SaveResult | null,
  formData: FormData,
): Promise<SaveResult> {
  await requireAdmin();

  const entries: { key: PrizePoolKey; allocationBps: number }[] = [];
  for (const key of ["main_league", "daily_bets"] as const) {
    const raw = formData.get(`alloc_${key}`);
    const pct = parseFloat(String(raw ?? ""));
    if (Number.isNaN(pct)) {
      return { ok: false, errors: [`Ogiltigt värde för ${key}.`] };
    }
    entries.push({ key, allocationBps: pctToBps(pct) });
  }

  const result = await savePoolAllocations(entries);
  if (result.ok) revalidatePath("/admin/config");
  return result;
}

export async function savePoolPlacesAction(
  poolKey: PrizePoolKey,
  places: { place: number; sharePct: number }[],
): Promise<SaveResult> {
  await requireAdmin();
  const mapped = places.map((p) => ({
    place: p.place,
    shareBps: pctToBps(p.sharePct),
  }));
  const result = await savePoolPlaces(poolKey, mapped);
  if (result.ok) revalidatePath("/admin/config");
  return result;
}
