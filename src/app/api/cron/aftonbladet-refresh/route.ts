import { NextResponse } from "next/server";
import { runIngestWithLog } from "@/lib/ingest-apply";
import { aftonbladetSource } from "@/lib/sources/aftonbladet";

/**
 * Cron-callable: re-runs the Aftonbladet ingest so prices and growth values
 * stay in sync during the tournament. Snapshots are upserted, so values
 * change in place; manual overrides are untouched (separate source key).
 *
 * Vercel Crons send `Authorization: Bearer ${CRON_SECRET}`. Verify when the
 * env var is set; otherwise allow (e.g. local manual hits).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const startedAt = new Date();
  try {
    const summary = await runIngestWithLog(aftonbladetSource, "cron");
    return NextResponse.json({
      ok: true,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      summary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, startedAt: startedAt.toISOString(), error: message },
      { status: 500 },
    );
  }
}
