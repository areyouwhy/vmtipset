"use client";

import { useClerk } from "@clerk/nextjs";

export function SignOutLink() {
  const { signOut } = useClerk();
  return (
    <button
      type="button"
      onClick={() => signOut({ redirectUrl: "/" })}
      className="text-dim hover:text-red"
    >
      LOGGA UT
    </button>
  );
}
