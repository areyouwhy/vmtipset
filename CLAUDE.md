@AGENTS.md

# CLAUDE.md

Guidance for Claude Code in this repo. Keep current — the project is mid-build.

## Project

**LA COPA DEL MUNDO 2026** (copa.ruy.se) — friend-group fantasy game for the 2026 FIFA World Cup. Target ~50–100 users. Built end of April / early May 2026.

The previous Astro/Blob/PIN-auth prototype was thrown away. This is the current build, live on copa.ruy.se.

## Status

### What ships today (Phase 1, live on prod)
- Sign up with Google (Clerk).
- Create a team — **at this stage a "team" is just a name + owner**. No players, formations, scoring, or anything fantasy-mechanic yet.
- See a Swish QR (300 SEK to 0703064211, message auto-fills the user's Clerk email so admin can reconcile offline).
- Admin (the email matching `ADMIN_EMAIL`) goes to `/admin`, sees pending users, clicks Approve/Reject.
- Approved users see a "you're in" stub on `/app`.

### What does NOT exist yet
- Aftonbladet player data ingest.
- Team-building UI (picking 11 players, budget, formation, captain).
- Round scoring or leaderboard.
- Round lifecycle (open/close, recompute).

### Open Phase 1 polish
- Deploy region is `iad1` (Washington DC); should be `fra1` or `arn1` (Stockholm) — DB is in Frankfurt so every call crosses the Atlantic.
- Clerk is on **test keys** in production (`pk_test_…` / `sk_test_…`). Works fine, has a "Development mode" badge and a 500-user cap. Real Production keys + real Google OAuth credentials are a future task.
- Preview env doesn't have Clerk keys — only Production and Development do.

## Stack

- **Next.js 16** App Router (Turbopack), TypeScript, Tailwind v4
- **Clerk** for auth (`@clerk/nextjs`)
- **Neon Postgres** (Vercel Marketplace, Frankfurt eu-central-1)
- **Drizzle ORM** with `@neondatabase/serverless` HTTP driver
- **qrcode** for the Swish QR PNG
- Hosted on **Vercel** Hobby

> Next.js 16 renames `middleware.ts` → **`proxy.ts`** (same functionality).

## Commands

- `npm run dev` — dev server (Turbopack)
- `npm run build` — production build
- `npm run db:push` — sync `src/db/schema.ts` to Neon (no migration files yet)
- `npm run db:studio` — Drizzle Studio
- `npm run lint` — ESLint

No tests yet.

## Environment

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` — Clerk keys (test keys currently)
- `DATABASE_URL` — Neon (other `POSTGRES_*` / `PG*` vars auto-set by the Neon integration but unused by app code)
- `ADMIN_EMAIL` — Clerk-account email that gets `/admin` access

`drizzle.config.ts` explicitly loads `.env.local` (not `.env`), so `db:push` works locally.

## File layout

```
src/
  proxy.ts                   — Clerk middleware, protects /app and /admin
  app/
    layout.tsx               — ClerkProvider, Geist Mono only
    globals.css              — Text-TV palette tokens, scanline overlay
    page.tsx                 — landing + live stats counts
    app/
      page.tsx               — branches on user state (no team / pending / approved / rejected)
      actions.ts             — createTeamAction (server action)
      create-team-form.tsx   — client form
      pending-panel.tsx      — Swish QR + payment instructions
    admin/
      page.tsx               — pending/approved/rejected lists, email-gated
      actions.ts             — approve / reject / reinstate
      user-row.tsx           — client row with action buttons
    api/
      swish-qr/route.ts      — generates per-user Swish QR PNG
  db/
    index.ts                 — Drizzle + Neon HTTP client
    schema.ts                — users, teams, user_status enum
  lib/
    auth.ts                  — getOrCreateDbUser, isAdmin
    swish.ts                 — buildSwishPayload + constants
drizzle.config.ts            — drizzle-kit config
vercel.json                  — pins framework: nextjs (overrides leftover Astro `dist` setting)
```

## Data model

- `users` — keyed by Clerk userId. Status enum: `pending` | `approved` | `rejected`. Row is lazily created on first `/app` visit via `getOrCreateDbUser()`.
- `teams` — uuid PK. `owner_user_id` is unique (one team per user). `name` is unique.

## Design

- **Pure monospace**, Geist Mono only.
- **No rounded corners**, hairline 1px borders.
- **Text-TV 8-color palette** on black background: yellow `#ffff00`, cyan `#00ffff`, green `#00ff00`, red `#ff0000`. White text. Dim `#888` for labels.
- ALL CAPS headers, wide letter-spacing, square brackets in button labels (`[ SKAPA LAG → ]`).
- Scanlines + subtle CRT vignette via `body::before` / `body::after` in `globals.css`.

## Conventions & gotchas

- Server components by default. `"use client"` only for forms (`useActionState`) and the admin row's transition buttons.
- DB access is server-only — never import `@/db` from a client component.
- Clerk's `<SignUpButton>`, `<SignInButton>`, `<SignOutButton>` use `React.Children.only()`. With React 19 + Next 16 + Turbopack, JSX whitespace between an opening tag and its child sometimes survives as a text node and trips the count. **Workaround:** keep the wrapped `<button>` on the same line as the Clerk tag.
- Don't use `<Show when="signed-in/out">` from Clerk — it's an async server component that flickered. Use `auth()` from `@clerk/nextjs/server` and a ternary instead.
- Custom CSS rules that should be overridable by Tailwind utilities (e.g. global `a` color) **must** live inside `@layer base` — otherwise unlayered rules beat utility classes.
- `vercel.json` pins `framework: "nextjs"` to override the project's lingering Astro output-directory setting from before the rebuild.

## Memory pointers

- `project_copa_liga.md` — durable architecture summary; keep aligned with this file.
