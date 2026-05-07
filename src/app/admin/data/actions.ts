"use server";

import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/auth";
import { runIngest, type IngestSummary } from "@/lib/ingest-apply";
import { mockSource } from "@/lib/sources/mock";

export async function runMockIngestAction(): Promise<IngestSummary> {
  if (!(await isAdmin())) throw new Error("Forbidden");
  const summary = await runIngest(mockSource);
  revalidatePath("/admin/data");
  return summary;
}
