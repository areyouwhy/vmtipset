"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { isAdmin } from "@/lib/auth";

async function requireAdmin() {
  if (!(await isAdmin())) throw new Error("Forbidden");
}

export async function approveUser(userId: string) {
  await requireAdmin();
  const now = new Date();
  await db
    .update(users)
    .set({ status: "approved", approvedAt: now, paidAt: now })
    .where(eq(users.id, userId));
  revalidatePath("/admin");
}

export async function rejectUser(userId: string) {
  await requireAdmin();
  await db
    .update(users)
    .set({ status: "rejected" })
    .where(eq(users.id, userId));
  revalidatePath("/admin");
}

export async function reinstateUser(userId: string) {
  await requireAdmin();
  await db
    .update(users)
    .set({ status: "pending", approvedAt: null, paidAt: null })
    .where(eq(users.id, userId));
  revalidatePath("/admin");
}
