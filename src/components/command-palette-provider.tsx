"use client";

import { useEffect, useState } from "react";
import { CommandPalette } from "./command-palette";

/**
 * Mounts the ⌘K palette globally + renders the floating chip on every page.
 * Auth info comes from the server (parent layout) so personal entries can
 * be gated without re-fetching client-side.
 */
export function CommandPaletteProvider({
  signedIn,
  approved,
  isAdmin,
  myTeamSlug,
}: {
  signedIn: boolean;
  approved: boolean;
  isAdmin: boolean;
  myTeamSlug: string | null;
}) {
  const [open, setOpen] = useState(false);

  // ⌘K / Ctrl+K to toggle. Use e.code so caps lock + layout don't matter.
  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if (e.code === "KeyK" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);

  return (
    <>
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        auth={{ signedIn, approved, isAdmin, myTeamSlug }}
      />

      {/* Floating chip — bottom-right on mobile + desktop. Above the iOS
          safe-area inset. Hidden when the palette is open (cmdk handles its
          own focus). */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Sök"
          className="
            fixed bottom-4 right-4 z-40 flex items-center gap-2
            border border-yellow bg-background px-3 py-2
            text-[11px] font-bold uppercase tracking-widest text-yellow
            shadow-[0_0_0_2px_black]
            transition hover:bg-yellow hover:text-black
            sm:bottom-6 sm:right-6
          "
          style={{
            paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0))",
          }}
        >
          <span aria-hidden>🔍</span>
          <span>SÖK</span>
          <span className="hidden text-dim sm:inline">⌘K</span>
        </button>
      )}
    </>
  );
}
