"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  GROUP_LETTERS,
  PAGE_ENTRIES,
  type PageEntry,
} from "@/lib/search-pages";
import type { SearchCatalog } from "@/app/api/search/route";

type Auth = {
  signedIn: boolean;
  approved: boolean;
  isAdmin: boolean;
  /** Slug of the viewer's own team — enables "Mitt lag" entry. */
  myTeamSlug: string | null;
};

const MAX_PER_GROUP = 8;

export function CommandPalette({
  open,
  onOpenChange,
  auth,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  auth: Auth;
}) {
  const router = useRouter();
  const [catalog, setCatalog] = useState<SearchCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [, startTransition] = useTransition();
  const fetchedRef = useRef(false);

  // Lazy-load the catalog the first time the palette opens. Use a ref so
  // the effect never re-fires, and startTransition for the async set so
  // React doesn't flag a cascade.
  useEffect(() => {
    if (!open || fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    fetch("/api/search")
      .then((r) => r.json())
      .then((d: SearchCatalog) => {
        startTransition(() => {
          setCatalog(d);
          setLoading(false);
        });
      })
      .catch(() => {
        startTransition(() => setLoading(false));
      });
  }, [open]);

  // Wrap onOpenChange to also reset the query on close — no effect needed.
  function handleOpenChange(next: boolean) {
    if (!next) setQuery("");
    onOpenChange(next);
  }

  function go(href: string) {
    handleOpenChange(false);
    router.push(href);
  }

  const pages = PAGE_ENTRIES.filter((p) => canSee(p, auth));
  const myEntries = personalEntries(auth);

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 sm:bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="
            fixed inset-0 z-50 flex flex-col bg-background
            sm:inset-auto sm:left-1/2 sm:top-1/4 sm:max-h-[70vh] sm:w-full
            sm:max-w-xl sm:-translate-x-1/2 sm:border sm:border-yellow
          "
        >
          <Dialog.Title className="sr-only">Sök</Dialog.Title>
          <Command label="Sök" shouldFilter className="flex h-full flex-col">
      <Command.Input
        autoFocus
        value={query}
        onValueChange={setQuery}
        placeholder="Sök spelare, landslag, sidor…"
        className="
          w-full border-b border-border bg-transparent px-4 py-3
          text-sm uppercase tracking-widest text-foreground
          placeholder:text-dim focus:outline-none
        "
      />

      <Command.List
        className="
          flex-1 overflow-y-auto p-1 text-sm
          sm:max-h-[60vh]
        "
      >
        <Command.Empty className="p-4 text-center text-dim">
          {loading ? "Laddar…" : "Inget hittat."}
        </Command.Empty>

        {myEntries.length > 0 && (
          <Group heading="Mitt">
            {myEntries.map((e) => (
              <Item
                key={e.id}
                value={`mitt ${e.label} ${e.keywords.join(" ")}`}
                onSelect={() => go(e.href)}
              >
                <Label>{e.label}</Label>
                <Hint>{e.href}</Hint>
              </Item>
            ))}
          </Group>
        )}

        {pages.length > 0 && (
          <Group heading="Sidor">
            {pages.map((p) => (
              <Item
                key={p.id}
                value={`sida ${p.label} ${p.keywords.join(" ")}`}
                onSelect={() => go(p.href)}
              >
                <Label>{p.label}</Label>
                <Hint>{p.href}</Hint>
              </Item>
            ))}
          </Group>
        )}

        <Group heading="Grupper">
          {GROUP_LETTERS.map((l) => (
            <Item
              key={`grupp-${l}`}
              value={`grupp ${l} group ${l}`}
              onSelect={() => go(`/vm/gruppspel#grupp-${l}`)}
            >
              <Label>Grupp {l}</Label>
              <Hint>/vm/gruppspel</Hint>
            </Item>
          ))}
        </Group>

        {catalog && catalog.rounds.length > 0 && (
          <Group heading="Ronder">
            {catalog.rounds.slice(0, MAX_PER_GROUP).map((r) => (
              <Item
                key={`rond-${r.number}`}
                value={`omgång rond ${r.number} ${r.name}`}
                onSelect={() => go(`/vm/omgang/${r.number}`)}
              >
                <Label>Omgång {r.number}</Label>
                <Hint>{r.name}</Hint>
              </Item>
            ))}
          </Group>
        )}

        {auth.signedIn && catalog && catalog.teams.length > 0 && (
          <Group heading="Lag">
            {catalog.teams.map((t) => (
              <Item
                key={`lag-${t.slug}`}
                value={`lag team ${t.name} ${t.owner}`}
                onSelect={() => go(`/team/${t.slug}`)}
              >
                <Label>
                  {t.name}
                  {t.status === "pending" && (
                    <span className="ml-2 text-[9px] uppercase tracking-widest text-yellow">
                      EJ SWISHAD
                    </span>
                  )}
                </Label>
                <Hint>{t.owner}</Hint>
              </Item>
            ))}
          </Group>
        )}

        {catalog && catalog.nations.length > 0 && (
          <Group heading="Landslag">
            {catalog.nations.map((n) => (
              <Item
                key={`land-${n.code}`}
                value={`landslag ${n.code} ${n.name}`}
                onSelect={() => go(`/landslag/${n.code}`)}
              >
                <Label>{n.name}</Label>
                <Hint>{n.code}</Hint>
              </Item>
            ))}
          </Group>
        )}

        {catalog && catalog.clubs.length > 0 && (
          <Group heading="Klubblag">
            {catalog.clubs.map((c) => (
              <Item
                key={`klubb-${c.slug}`}
                value={`klubb ${c.name}`}
                onSelect={() => go(`/klubblag/${c.slug}`)}
              >
                <Label>{c.name}</Label>
                <Hint>/klubblag/{c.slug}</Hint>
              </Item>
            ))}
          </Group>
        )}

        {catalog && catalog.players.length > 0 && (
          <Group heading="Spelare">
            {catalog.players.map((p) => (
              <Item
                key={`spelare-${p.id}`}
                value={`spelare ${p.name} ${p.country ?? ""} ${p.club ?? ""}`}
                onSelect={() => go(`/spelare/${p.id}`)}
              >
                <Label>
                  <span className="text-yellow">{p.position}</span> {p.name}
                </Label>
                <Hint>
                  {[p.country, p.club].filter(Boolean).join(" · ")}
                </Hint>
              </Item>
            ))}
          </Group>
        )}
      </Command.List>

      <footer className="hidden border-t border-border px-4 py-2 text-[10px] uppercase tracking-widest text-dim sm:flex sm:justify-between">
        <span>↑↓ navigera · ↵ gå · esc stäng</span>
        <button
          type="button"
          onClick={() => handleOpenChange(false)}
          className="text-dim hover:text-yellow"
        >
          stäng ✕
        </button>
      </footer>

      <Dialog.Close
        aria-label="Stäng"
        className="absolute right-3 top-3 text-dim hover:text-yellow sm:hidden"
      >
        ✕
      </Dialog.Close>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Group({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <Command.Group
      heading={heading}
      className="
        [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2
        [&_[cmdk-group-heading]]:text-[10px]
        [&_[cmdk-group-heading]]:uppercase
        [&_[cmdk-group-heading]]:tracking-widest
        [&_[cmdk-group-heading]]:text-yellow
      "
    >
      {children}
    </Command.Group>
  );
}

function Item({
  value,
  onSelect,
  children,
}: {
  value: string;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="
        flex cursor-pointer items-baseline justify-between gap-3
        px-3 py-2 text-sm
        data-[selected=true]:bg-yellow/15 data-[selected=true]:text-yellow
      "
    >
      {children}
    </Command.Item>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="truncate text-foreground">{children}</span>;
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 text-[10px] uppercase tracking-widest text-dim">
      {children}
    </span>
  );
}

function canSee(entry: PageEntry, auth: Auth): boolean {
  if (!entry.requires) return true;
  if (entry.requires === "signed-in") return auth.signedIn;
  if (entry.requires === "approved") return auth.approved;
  if (entry.requires === "admin") return auth.isAdmin;
  return false;
}

function personalEntries(auth: Auth) {
  const out: Array<{ id: string; label: string; href: string; keywords: string[] }> = [];
  if (auth.signedIn) {
    out.push({
      id: "min-status",
      label: "Min status",
      href: "/app",
      keywords: ["min sida", "my page", "dashboard", "status"],
    });
  }
  if (auth.approved) {
    out.push({
      id: "min-trupp",
      label: "Min trupp",
      href: "/app/squad",
      keywords: ["squad", "my squad", "min squad", "byten", "transfers"],
    });
  }
  if (auth.myTeamSlug) {
    out.push({
      id: "mitt-lag",
      label: "Mitt lag",
      href: `/team/${auth.myTeamSlug}`,
      keywords: ["my team", "min lag", "lagsida", "profil"],
    });
  }
  return out;
}
