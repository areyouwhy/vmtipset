@AGENTS.md

# CLAUDE.md

Guidance for Claude Code in this repo. Keep current — the project is mid-build.

## Project

**LA COPA DEL MUNDO 2026** (copa.ruy.se) — friend-group fantasy game for the 2026 FIFA World Cup. Target ~50–100 users. Built end of April / early May 2026.

The previous Astro/Blob/PIN-auth prototype was thrown away. This is the current build, live on copa.ruy.se.

## Status

> The authoritative rule set + per-rule implementation status is in **`RULES.md`**. This section describes the *app surface* — routes, jobs, data flows — not the rules of play.

### Auth + user lifecycle
- Sign up / sign in with Google via Clerk's embedded `<SignIn />` / `<SignUp />` components on `/sign-in` and `/sign-up`. Account Portal is bypassed by design.
- First `/app` visit lazy-creates a `users` row (status `pending`) via `getOrCreateDbUser()`.
- `/app` for a pending user shows the Swish QR (300 SEK, message auto-fills their Clerk email) so admin can reconcile offline.
- Admin (`ADMIN_EMAIL`) approves/rejects users at `/admin`. Approved users get the team builder.

### Game flow
- **Team creation** at `/app` (one team per user, name unique).
- **Squad picker** at `/app/squad` — 11 starters within a 50 M SEK budget, formation/position constraints from `src/lib/rules.ts`, captain selection, max-3-from-the-same-country cap, mid-tournament transfers with 1% fee on the outgoing player's price.
- **Round lifecycle**: rounds come from Aftonbladet (status `upcoming → open → locked → scored`). `squads.lockedAt` is flipped by the `lock-deadlines` cron when a round's deadline passes; the picker hides edit controls past that point.
- **Scoring**: pure engine in `src/lib/scoring.ts` (sum of price growth, captain bonus, bank interest, minus transfer fees). Run per-round via `src/lib/score-runner.ts`. Output stored in `team_round_scores`.
- **Leaderboard** at `/tabell` (`src/lib/leaderboard.ts`) — total points, per-round, rank delta, team value, daily-bets points as a separate column.
- **Public team page** at `/team/[slug]` (slugged team name).

### Side games
- **Daily / round bets** (mode B) — admin creates `bets` at `/admin/bets`, users answer at `/app` until each bet's deadline. Two answer types: `player_ref` (exact player) or `numeric` (exact match). Bets feed a **separate prize pool** (`daily_bets` in `prize_pools`).
- **Side bets** (mode C) — display-only social bets at `/side-bets`, no money/scoring. Admin manages at `/admin/side-bets`.

### Aftonbladet ingest
- `src/lib/sources/aftonbladet.ts` is a real client for `api-manager.aftonbladet.se`. Default game id `735` (WC 2026, ruleset `197`). Mock source at `src/lib/sources/mock.ts` for tests/offline.
- `src/lib/ingest.ts` is the **pure planner** (computes a diff vs DB without writing); `src/lib/ingest-apply.ts` applies the plan. This is the testable seam.
- Cron `GET /api/cron/aftonbladet-refresh` re-runs the ingest daily (04:15 UTC). Snapshots are upserted; manual overrides live in a separate source key and are untouched.
- Manual override / labeling helpers in `src/data/player-clubs.ts`.

### Tournament data
- WC bracket views at `/vm`, `/vm/gruppspel`, `/vm/omgang/[n]`, `/vm/slutspel`. Backed by `src/lib/wc-tournament.ts`.
- Player + club browsing at `/spelare`, `/spelare/[id]`, `/klubblag`, `/klubblag/[slug]`, `/landslag/[code]`.

### Admin surface (all `ADMIN_EMAIL`-gated)
- `/admin` — user approvals.
- `/admin/players` (+ `/admin/players/[id]`) — player roster, search/filter, manual overrides, active/inactive toggle.
- `/admin/rounds` — round status, fast-forward / re-score actions.
- `/admin/bets` — daily/round bet CRUD + scoring.
- `/admin/side-bets` — social side-bet CRUD.
- `/admin/data` — ingest snapshot counts + last-run state.
- `/admin/config` — prize pool % allocation + per-place share editing (`prize_pools` / `prize_places`).

### Transparency
- `/hur` — human-readable rules page (mirrors `RULES.md`); links to `RULES.md` on GitHub + audit page.
- `/hur/audit` — diff between the rules in `src/lib/rules.ts` and what's actually being applied.

### Infra
- Vercel Hobby, deploy region pinned to `arn1` (Stockholm) via `vercel.json`.
- Neon Postgres in `eu-west-2` (London) — ~30 ms hop from Stockholm.
- Two Vercel Crons (in `vercel.json`): `lock-deadlines` (04:00 UTC) and `aftonbladet-refresh` (04:15 UTC). Both verify `Authorization: Bearer ${CRON_SECRET}`.
- Clerk on **production keys** (`pk_live_…` / `sk_live_…`), Frontend API on `clerk.copa.ruy.se`, Google OAuth uses the project's own Google Cloud OAuth client (configured in Clerk Dashboard).
- DNS for `copa.ruy.se` is **DNS-only (gray cloud) at Cloudflare**, pointing straight at Vercel (`76.76.21.21`). **Do not orange-cloud it** — Cloudflare proxy in front of Vercel breaks Clerk's handshake-cookie exchange (the `__session` cookie never lands → users bounce back to sign-in) and adds ~150 ms per request. Clerk's own records (`clerk`, `accounts`, `clk._domainkey`, `clkmail`) are also DNS-only.
- Preview env doesn't have Clerk keys — only Production and Development do.

### Known gaps / things still missing
- Production data has been wiped clean (2026-05-16) to start fresh — first real round of transfers / scoring against live Aftonbladet data hasn't been run end-to-end yet on this prod Clerk instance.
- No bench / chips / push notifications — see `RULES.md` "Skipped on purpose".
- Email reconciliation of Swish payments is still manual (admin marks `paid_at` via approval flow).

## Stack

- **Next.js 16** App Router (Turbopack), TypeScript, Tailwind v4
- **Clerk** for auth (`@clerk/nextjs`)
- **Neon Postgres** (Vercel Marketplace, `eu-west-2` London)
- **Drizzle ORM** with `@neondatabase/serverless` HTTP driver
- **qrcode** for the Swish QR PNG
- Hosted on **Vercel** Hobby

> Next.js 16 renames `middleware.ts` → **`proxy.ts`** (same functionality).

## Commands

- `npm run dev` — dev server (Turbopack)
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — Vitest unit/integration tests, single run
- `npm run test:watch` — Vitest in watch mode
- `npm run test:e2e` — Playwright E2E (boots a dev server on port 3100; run `npx playwright install chromium` once before first use)
- `npm run db:generate` — generate a new SQL migration from `src/db/schema.ts`
- `npm run db:migrate` — apply pending migrations to the DB pointed at by `DATABASE_URL`
- `npm run db:push` — bypass migrations and shove the schema into the DB (prototyping only)
- `npm run db:studio` — Drizzle Studio

## Environment

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` — Clerk **production** keys (`pk_live_…` / `sk_live_…`). If the secret key is wrong/truncated, server-side handshake silently fails — users authenticate at Google + appear in the Clerk dashboard but the `__session` cookie never lands on the app. Verify with `curl -H "Authorization: Bearer $CLERK_SECRET_KEY" https://api.clerk.com/v1/users?limit=1`.
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up` — override Clerk's Account Portal so the embedded components handle auth on `copa.ruy.se` directly.
- `DATABASE_URL` — Neon (other `POSTGRES_*` / `PG*` vars auto-set by the Neon integration but unused by app code).
- `ADMIN_EMAIL` — Clerk-account email that gets `/admin` access.
- `CRON_SECRET` — required header for `/api/cron/*` routes.
- `AFTONBLADET_API_BASE`, `AFTONBLADET_GAME_ID` — optional overrides for the ingest client (defaults: official base + game `735`).

`drizzle.config.ts` explicitly loads `.env.local` (not `.env`), so `db:push` works locally.

## File layout

```
src/
  proxy.ts                   — Clerk middleware, protects /app and /admin
  app/
    layout.tsx               — ClerkProvider, Geist Mono only
    globals.css              — Text-TV palette tokens, scanline overlay
    page.tsx                 — landing + live stats counts + prize-pool preview
    auth-buttons.tsx         — landing CTA buttons (Link to /sign-in & /sign-up)
    sign-in/[[...sign-in]]   — embedded Clerk <SignIn />
    sign-up/[[...sign-up]]   — embedded Clerk <SignUp />
    app/                     — authenticated player surface
      page.tsx               — branches on user state + bets section
      squad/                 — team builder (page + picker + actions)
      bets/                  — daily/round bet answer submission
      create-team-form.tsx, pending-panel.tsx, sign-out-link.tsx, bets-section.tsx
    admin/                   — ADMIN_EMAIL-gated
      page.tsx, user-row.tsx, actions.ts          — approvals
      data/                   — ingest dashboard
      rounds/                 — round mgmt + fast-forward
      bets/, side-bets/       — bet CRUD
      players/[id]            — player roster + manual overrides
      config/                 — prize-pool allocation editor
    team/[slug]               — public team page (slugged team name)
    tabell/                   — leaderboard
    spelare/, spelare/[id]    — players list + detail
    klubblag/, klubblag/[slug] — clubs list + detail
    landslag/[code]           — national team detail
    vm/, vm/gruppspel,
    vm/omgang/[n], vm/slutspel — WC bracket views
    side-bets/                — public social bets
    hur/, hur/audit           — rules transparency
    api/
      swish-qr/route.ts       — per-user Swish QR PNG
      players/list/route.ts   — JSON for the players UI
      cron/
        lock-deadlines        — flips squads.lockedAt past deadline
        aftonbladet-refresh   — re-runs ingest
  db/
    index.ts                  — Drizzle + Neon HTTP client
    schema.ts                 — 16 tables (see Data model)
  lib/
    auth.ts                   — getOrCreateDbUser, isAdmin
    rules.ts                  — RuleSet source of truth (read by app + /hur)
    swish.ts                  — buildSwishPayload + constants
    ingest.ts, ingest-apply.ts — pure planner + applier
    sources/{aftonbladet,mock,types}.ts — external data source clients
    scoring.ts, score-runner.ts — pure scoring engine + per-round runner
    leaderboard.ts            — getLeaderboard with ranks + deltas
    transfers.ts              — pure transfer-diff + fee computation
    prizes.ts, prize-config.ts — prize-pool math + DB-backed config
    bets.ts, bets-data.ts     — daily/round bet logic + queries
    squad-data.ts             — squad picker server data
    players-data.ts, wc-tournament.ts, nation-data.ts, jersey-map.ts
  data/
    player-clubs.ts           — manual club/country overrides
drizzle.config.ts             — drizzle-kit config (loads .env.local explicitly)
vercel.json                   — framework: nextjs + region arn1 + cron schedule
```

## Data model

16 tables in `src/db/schema.ts`. All FKs from `users` / `teams` are `ON DELETE CASCADE`, so `DELETE FROM users` wipes the whole player-side graph cleanly (used during the 2026-05-16 prod reset). `rivalry_votes` is the one exception — deliberately isolated (no FK), see below.

People & teams
- `users` — keyed by Clerk userId. Status enum: `pending` | `approved` | `rejected`. Row is lazily created on first `/app` visit via `getOrCreateDbUser()`.
- `teams` — uuid PK. `owner_user_id` is unique (one team per user). `name` is unique.

External catalog (filled by ingest)
- `clubs` — national teams (the WC equivalent of a club).
- `players` — keyed by Aftonbladet external id, plus position enum (`GK` | `DEF` | `MID` | `FWD`) and `active` flag.
- `rounds` — keyed by external id. Status enum: `upcoming` | `open` | `locked` | `scored`. Holds `deadline`.
- `player_round_snapshots` — per-player price + growth per round, `source` enum (`api` | `manual`).

Squad state
- `squads` — one per (team, round). `lockedAt` set by the cron when the round's deadline passes.
- `squad_players` — composite (squad_id, player_id), with `is_captain`.
- `transfers` — outgoing/incoming player pair + `fee_sek`. One row per swap.

Money + side games
- `team_round_scores` — output of the scoring engine per (team, round): `points_sek`, captain bonus, bank interest, transfer fees.
- `bets`, `bet_answers` — daily/round bets. `bet_answer_type` enum (`player_ref` | `numeric`); `bet_status` (`open` | `closed` | `scored`).
- `side_bets` — display-only social bets.
- `prize_pools`, `prize_places` — prize allocation config. `prize_pool_key` enum: `main_league` | `daily_bets`.
- `rivalry_votes` — `/hets` banter voting (`rivalry_slug`, `user_id` = Clerk id, `side_key`). One changeable vote per `(rivalry_slug, user_id)`. **No FK** to users/teams on purpose, so it's fully isolated from the game graph and even users without a `users` row can vote. Created on prod via a manual `CREATE TABLE` (the migration baseline is still unseeded — see Migrations), not `db:migrate`.

## Design

- **Pure monospace**, Geist Mono only.
- **No rounded corners**, hairline 1px borders.
- **Text-TV 8-color palette** on black background: yellow `#ffff00`, cyan `#00ffff`, green `#00ff00`, red `#ff0000`. White text. Dim `#888` for labels.
- ALL CAPS headers, wide letter-spacing, square brackets in button labels (`[ SKAPA LAG → ]`).
- Scanlines + subtle CRT vignette via `body::before` / `body::after` in `globals.css`.

## Migrations

- Schema lives in `src/db/schema.ts`.
- Generated SQL migrations live in `drizzle/` and are checked into git.
- Local dev still uses `db:push` for fast iteration. Don't push to prod — generate a migration file and use `db:migrate` for any change that needs to land on the live DB.
- **Open issue:** the production Neon DB was bootstrapped with `db:push`, so the `__drizzle_migrations` tracking table is empty even though the schema matches `0000_absent_terrax.sql`. Before the first prod migration goes out, manually seed a row into `__drizzle_migrations` for the baseline so `db:migrate` doesn't try to recreate tables. (Or just drop & recreate the DB while we have no real users.)

## Testing

- **Vitest** for unit + component tests. Files: `src/**/*.test.ts(x)`.
- **Playwright** for E2E. Files: `e2e/*.spec.ts`. Boots `next dev` on port 3100.
- **CI** (`.github/workflows/ci.yml`) runs lint + typecheck + Vitest on every push to `main` and on PRs. Playwright stays local for now (no DB in CI yet).
- **Money-math rule:** every scoring / prize-distribution / transfer-fee function gets a golden-master test with hand-calculated expected values **before** it ships.

## Conventions & gotchas

- Server components by default. `"use client"` only for forms (`useActionState`) and the admin row's transition buttons.
- DB access is server-only — never import `@/db` from a client component.
- Clerk's `<SignUpButton>`, `<SignInButton>`, `<SignOutButton>` use `React.Children.only()`. With React 19 + Next 16 + Turbopack, JSX whitespace between an opening tag and its child sometimes survives as a text node and trips the count. **Workaround:** keep the wrapped `<button>` on the same line as the Clerk tag.
- Don't use `<Show when="signed-in/out">` from Clerk — it's an async server component that flickered. Use `auth()` from `@clerk/nextjs/server` and a ternary instead.
- Custom CSS rules that should be overridable by Tailwind utilities (e.g. global `a` color) **must** live inside `@layer base` — otherwise unlayered rules beat utility classes.
- `vercel.json` pins `framework: "nextjs"` to override the project's lingering Astro output-directory setting from before the rebuild.

## Memory pointers

- None right now. If a durable architecture / rules summary gets written into `~/.claude/.../memory/`, add the pointer here so future sessions know to consult it.
