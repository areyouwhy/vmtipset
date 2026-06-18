"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Global cross-navigation strip shown at the top of every content page:
 * VM · LIVE · TABELL · MIN TRUPP · OMGÅNG N. Rendered once in the root layout.
 * The active section is highlighted (yellow) from the pathname, but stays a
 * link so it always navigates to the section root.
 *
 * Hidden on the landing page and the auth screens, which have their own chrome.
 * "MIN TRUPP" only shows for approved users with a team (`showSquad`), so the
 * strip never links somewhere that bounces a visitor to login.
 */
export function QuickNav({
  showSquad,
  currentRound,
}: {
  showSquad: boolean;
  currentRound: number;
}) {
  const pathname = usePathname();
  if (
    pathname === "/" ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up")
  ) {
    return null;
  }

  const items: { key: string; href: string; label: React.ReactNode }[] = [
    {
      key: "live",
      href: "/live",
      label: (
        <>
          <span className="text-red">●</span> LIVE
        </>
      ),
    },
    { key: "vm", href: "/vm", label: "VM" },
    { key: "tabell", href: "/tabell", label: "TABELL" },
    {
      key: "round",
      href: `/vm/omgang/${currentRound}`,
      label: `OMGÅNG ${currentRound}`,
    },
    ...(showSquad
      ? [{ key: "squad", href: "/app/squad", label: "MIN TRUPP" }]
      : []),
  ];

  const active = pathname.startsWith("/vm/omgang")
    ? "round"
    : pathname.startsWith("/live")
      ? "live"
      : pathname.startsWith("/tabell")
        ? "tabell"
        : pathname.startsWith("/app/squad")
          ? "squad"
          : pathname.startsWith("/vm")
            ? "vm"
            : null;

  return (
    <nav className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border py-2 text-[11px] uppercase tracking-widest">
      {items.map((item, i) => (
        <span key={item.key} className="flex items-center gap-3">
          {i > 0 && <span className="text-dim">|</span>}
          <Link
            href={item.href}
            aria-current={active === item.key ? "page" : undefined}
            className={
              active === item.key ? "text-yellow" : "text-cyan hover:text-yellow"
            }
          >
            {item.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}
