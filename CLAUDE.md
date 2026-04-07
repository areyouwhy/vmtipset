# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

vmtipset — Friend group competition hub for the 2026 FIFA World Cup ("La Copa del Mundo 2026"). A social companion site wrapping Aftonbladet's VM-elvan fantasy game, hosted at copa.ruy.se.

## Commands

- `npm run dev` — Start local dev server
- `npm run build` — Build to `./dist/`
- `npm run preview` — Preview production build

No test runner or linter configured. Deploy happens automatically via Vercel on push to `main`.

## Architecture

**Astro 6 in server mode** (`output: 'server'`) with Vercel adapter. Three dependencies total: `astro`, `@astrojs/vercel`, `qrcode`.

### Single-page monolith

The entire frontend lives in `src/pages/index.astro` (~2200 lines):
- Server-rendered HTML with `<style is:global>` (all CSS must be global — Astro scoping breaks JS-generated content)
- `<script is:inline>` for client-side JS (vanilla, no framework, no bundling)
- Client JS uses string concatenation to build HTML and SVG charts, then injects via `innerHTML`
- State is global variables (`selectedTeamId`, `leaderboardData`, `statsData`, `currentPage`)

### API routes

All in `src/pages/api/`, all fetch from the Swush API (`https://api-manager.aftonbladet.se`). No auth required — all endpoints are public.

| Route | Purpose |
|-------|---------|
| `/api/leaderboard.ts` | Paginated standings with team growth/points |
| `/api/stats.ts` | Aggregated highlights across all teams (best round, most trades, streaks, etc.) |
| `/api/matches.ts` | Current round, deadline, upcoming fixtures, recent results |
| `/api/team/[id].ts` | Single team detail: players, round-by-round values, trades |
| `/api/swish-qr.ts` | Generates Swish C2B payment QR code as PNG |

API routes use `Promise.all()` for parallel fetching. Errors return 500 with JSON error message.

### Key constants (hardcoded in API files)

- `COMPETITION_ID = '666201'` — Currently a test league (PL Spring 2026). Will change to VM-elvan 2026 when it launches.
- `GAME_ID = '731'` — Same test game. Used in `/api/matches.ts`.
- `API_BASE = 'https://api-manager.aftonbladet.se'` — Swush API base URL (no CORS — must proxy server-side).

### Theme system

Three country themes (URU/SWE/TUN) with CSS variables, persisted in `localStorage['vmtipset-theme']`. Each theme swaps colors, hero/break images, and subtitle text. Images in `public/` follow `{theme}-{type}.webp` naming.

### Tab navigation

Main tabs: Tabell (leaderboard), Matcher (fixtures), Statistik (highlights/charts), Head to Head.
Team detail tabs appear when a team is selected from the leaderboard.

## Conventions

- **No `.env` file** — all config is public constants, no secrets
- **Vanilla JS only** — no TypeScript on the client, no component framework
- **SVG charts** — built as string templates (line charts, bar charts, race charts), no charting library
- **XSS prevention** — use `escapeHtml()` utility for user-generated text
- Node.js >= 22.12.0 required
