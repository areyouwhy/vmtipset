"use client";

import { useTransition } from "react";
import { approveUser, rejectUser, reinstateUser } from "./actions";

type Row = {
  id: string;
  email: string;
  displayName: string | null;
  status: "pending" | "approved" | "rejected";
  teamName: string | null;
  createdAt: Date;
};

export function UserRow({ row }: { row: Row }) {
  const [pending, startTransition] = useTransition();

  return (
    <li className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm">
          <span className="text-yellow">{row.teamName ?? "(inget lag)"}</span>
        </p>
        <p className="truncate text-xs text-dim">
          {row.displayName ? `${row.displayName} · ` : ""}
          {row.email}
        </p>
      </div>

      <div className="flex shrink-0 gap-2 text-[10px] uppercase tracking-widest">
        {row.status === "pending" && (
          <>
            <button
              onClick={() =>
                startTransition(async () => {
                  await approveUser(row.id);
                })
              }
              disabled={pending}
              className="border border-green px-3 py-1.5 font-bold text-green transition hover:bg-green hover:text-black disabled:opacity-40"
            >
              [ GODKÄNN ]
            </button>
            <button
              onClick={() =>
                startTransition(async () => {
                  await rejectUser(row.id);
                })
              }
              disabled={pending}
              className="border border-border px-3 py-1.5 text-dim transition hover:border-red hover:text-red disabled:opacity-40"
            >
              [ AVVISA ]
            </button>
          </>
        )}
        {row.status !== "pending" && (
          <button
            onClick={() =>
              startTransition(async () => {
                await reinstateUser(row.id);
              })
            }
            disabled={pending}
            className="border border-border px-3 py-1.5 text-dim transition hover:border-yellow hover:text-yellow disabled:opacity-40"
          >
            [ ÅTERSTÄLL ]
          </button>
        )}
      </div>
    </li>
  );
}
