# Backlog — Copa del Mundo 2026

The plan for taking copa.ruy.se from "auth + signup shipped" to "fully working money-backed friend league". Each epic ships behind tests; nothing scoring-related lands without golden-master coverage.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done

---

## Decisions (frozen)

- **Stack:** Next.js 16 + Clerk + Neon + Drizzle + Tailwind v4. Vitest + Playwright for tests.
- **Three game modes:**
  - **A — Main league.** Standard Aftonbladet Manager ruleset. Squad of players, transfers, scoring, leaderboard.
  - **B — Daily/round bets.** Admin posts a question; users answer; admin enters the truth; points awarded. Separate ranking, separate prize pool slice.
  - **C — Side bets.** Same as B in spirit but no money, no scoring, displayed only. Manual offline.
- **Source data:** Aftonbladet API. Manual admin override always available (also our test-data path before WC 2026 starts; PL data works as a placeholder).
- **Money model:** 300 SEK / approved user. The total pot is split into pools by configurable %s (e.g. main 80% / daily-bets 20%). Each pool then distributes by configurable place %s.
- **Transparency:** Public `/how` page renders the *live* rules + scoring formula + pool/place split. `/audit` page exposes per-round inputs so any user can recompute their score by hand.
- **Aftonbladet rules:** implemented verbatim. Any deviation **must** be recorded in `RULES.md` with date + reason.

---

## Open questions (still TBD)

- **Numeric-bet scoring**: exact match only, closest-wins, or tolerance bands? Default proposal: **exact match only** for v1; revisit if it feels too binary.
- **Bet edit window**: can a user change their answer up to the bet's deadline, or is first answer locked? Default: **editable until deadline**.
- **Round granularity**: is a "round" one match day, or one stage (group stage = 1 round)? Aftonbladet's API will dictate this; defer until we see real data.
- **Late entries**: if someone gets approved mid-tournament, are they in for what's left, retroactive zero, or refunded? Default: **forward-only, no refund**.
- **Tie-breakers** in main league and bet pool. Default: **shared place, prize money split equally between tied users**.
- **Prize pool freeze point**: when does the prize % distribution lock? Default: **at first scoring run** — until then admin can edit freely.

Each default above is what I'll implement unless you push back.

---

## Conventions

### Testing

- **Vitest** for unit + integration. Lives in `src/**/*.test.ts` next to the code.
- **Playwright** for E2E. Lives in `e2e/`.
- **CI** runs both on every push. PRs cannot merge red.
- **Money-math** functions (scoring, prize distribution, pot split, transfer fees) are golden-master tested with hand-calculated expected values, including edge cases: rounding, integer overflow, single-user pot, ties, all-zero scores.
- **Validation rules** (squad legality, formation, budget, same-club limit) each have valid + invalid + boundary tests.

### Migrations

- Switch from `drizzle-kit push` to **checked-in SQL migrations** (`drizzle-kit generate`) before any user data we care about exists. Never push schema changes to production without a tracked migration.

### Audit & transparency

- Every score row stores the snapshot ids it was computed from.
- `/how` page is generated from the live config — never a separate static document that can drift.
- `RULES.md` lists every rule we implement and every Aftonbladet rule we skip, with reasons.
- `/audit` page available from the moment scoring goes live.

### UX

- Mobile-first. Desktop variants only when mobile layout cramps.
- Maintain Text-TV monospace style across all surfaces.
- Every interactive flow works without JavaScript where reasonable (server actions over fetch).

---

## Epics

### Epic 1 — Test infra + migrations *(blocking, do first)* ✓

- [x] Vitest + `@testing-library/react` + jsdom installed. Smoke test for `buildSwishPayload`.
- [x] Playwright config + landing-page smoke test (E2E runs locally).
- [x] GitHub Actions: lint + typecheck + Vitest on every push to `main` and on PRs.
- [x] Drizzle migration files: baseline `0000_absent_terrax.sql` checked in. `db:generate` and `db:migrate` scripts. (Open: prod DB needs `__drizzle_migrations` baseline seed before first prod migration — handled inline in Epic 3.)
- [x] `buildSwishPayload` regression tests.

### Epic 2 — Aftonbladet ruleset documentation ✓

- [~] Read & summarize Aftonbladet Manager 2026 ruleset — **WC ruleset not yet published**. Inheriting PL ruleset 193 as placeholder; values flagged `IMPLEMENTED-UNVERIFIED`.
- [x] `RULES.md` with status per rule + deviation log + skip-with-reason list.
- [x] PL inheritance and unverified values clearly called out.
- [x] `/how` page renders directly from `src/lib/rules.ts` (typed config = source of truth, not the markdown).
- [x] Sanity tests for `currentRules` (formations, position bounds, multipliers).

### Epic 3 — Player data foundation

**Phase A — schema, types, ingest pipeline, mock source ✓**
- [x] Schema: `clubs`, `players`, `rounds`, `player_round_snapshots`. Snapshots immutable, unique on `(player, round, source)`.
- [x] `DataSource` interface + `mockSource` (3 PL clubs, 12 players, 2 rounds) for tests + dev.
- [x] `aftonbladetSource` stub — typed shape ready, real fetch deferred to Phase C.
- [x] Pure `planIngest()` with idempotency, change detection, and orphan flagging.
- [x] `applyPlan()` + `runIngest()` apply layer.
- [x] Admin `/admin/data` page with "RUN MOCK INGEST" button + counts + summary panel.
- [x] 13 tests covering insert, idempotency, club/player/round updates, snapshot append-only, orphan detection.

**Phase B — manual-override UI (next)**
- [ ] `/admin/players` page: searchable/filterable list with current-price column.
- [ ] Per-player edit drawer/page: write a `manual` snapshot for a chosen round (price + growth + notes). Never deletes the `api` snapshot.
- [ ] Tests for the manual-override path.

**Phase C — real Aftonbladet client + cron**
- [ ] Implement `aftonbladetSource.fetchAll()` against the real WC 2026 endpoints.
- [ ] Vercel cron (daily during tournament) to call `runIngest(aftonbladetSource)`.
- [ ] Backoff/retry + alerting if the source 5xxs.
- [ ] Once ingest is live, flip `RULES.md` `meta.lastVerifiedAt` and confirm the 7 `IMPLEMENTED-UNVERIFIED` rules.

### Epic 4 — Game config + rounds + prize pool

- [ ] Schema: `league_config` (singleton row, JSON for rules), `rounds` (id, name, deadline, status: `open` | `locked` | `scored`), `prize_pools` (e.g. `main_league`, `daily_bets` with allocation %), `prize_places` (per pool, place + %).
- [ ] Admin UI: edit rules until first squad is picked; edit pool allocation until first scoring run; edit place % until first scoring run.
- [ ] Pot calc: pot = 300 × (count of `users` with `status='approved'`). Recomputes on every approve/reject.
- [ ] `/how` page reads from these tables.
- [ ] Tests: pool % must sum to 100; place % per pool must sum to 100; pot allocation math; reject edits past freeze point.

### Epic 5 — Squad picking + transfers (mode A)

- [ ] Schema: `squads` (team_id, round_id, captain_player_id), `squad_players` (squad_id, player_id, is_captain), `transfers` (team_id, round_id, player_in, player_out, fee).
- [ ] Mobile-first picker UI: list players filterable by club / position / price; running budget; running formation count; "save squad" enabled only when valid.
- [ ] Validation (server-side authoritative): exact 11 players, formation legal, budget ≤ cap, captain selected, same-club limit respected.
- [ ] Transfer flow: between rounds only; transfer fee deducted; transfer log row written.
- [ ] Squad locked at round deadline (server-side check, not just UI).
- [ ] Tests for every rule, valid + invalid path each.

### Epic 6 — Daily/round bets (mode B)

- [ ] Schema: `bets` (id, round_id, question_text, answer_type: `player_ref` | `numeric`, deadline, correct_answer_player_id?, correct_answer_numeric?, points_value, status: `open` | `closed` | `scored`), `bet_answers` (bet_id, user_id, answer_player_id?, answer_numeric?, submitted_at).
- [ ] Admin UI: create bet (question + type + deadline + points). Reveal correct answer when ready.
- [ ] User UI: see open bets on `/app`; submit/edit answer until deadline.
- [ ] Scoring: when admin sets correct answer, mark bet `scored`, award points to matching answers.
- [ ] Numeric scoring: exact match only for v1.
- [ ] Tests: scoring under correct/wrong/null answers; double-submit prevention; deadline enforcement.

### Epic 7 — Round lifecycle + scoring (mode A)

- [ ] Server action `closeRound(roundId)` (admin-only): locks squads, runs scoring, persists `team_round_scores` (with snapshot ids referenced), marks round `scored`.
- [ ] Scoring fn lives in `src/lib/scoring.ts`. Pure function: inputs in, score out. No DB calls inside it.
- [ ] Re-runnable: re-running on the same round produces identical scores.
- [ ] Captain bonus, transfer fee, bank interest (if Aftonbladet uses it) — every component is a separate small function with its own test.
- [ ] Golden-master tests: 5 hand-calculated scenarios (single-player, mixed, captain-not-played, all-zero growth, transfer fees + interest).

### Epic 8 — Leaderboards, detail views, audit

- [ ] `/leaderboard` for each pool: total points + per-round position arrows.
- [ ] `/team/[id]`: squad per round, transfers, score breakdown, bet answers + bet score breakdown.
- [ ] `/player/[id]`: price + points history line chart.
- [ ] `/audit` (or `/how/audit`): per round, every input snapshot used for scoring is listed. Anyone can manually recompute.
- [ ] Tests: leaderboard ordering with ties; rank-change-arrow logic.

### Epic 9 — Side bets (mode C, no money)

- [ ] Schema: `side_bets` (similar shape to `bets` but no money + no enforced scoring).
- [ ] Admin posts; users see; results displayed manually.
- [ ] No scoring engine here. Pure display.

### Epic 10 — Polish + production readiness

- [ ] Deploy region: change Vercel project from `iad1` → `arn1` or `fra1`.
- [ ] Switch Clerk from test keys to live keys + real Google OAuth credentials.
- [ ] Add Clerk keys to Preview env so PR previews work.
- [ ] Mobile-bottom-nav for `/app` if it gets dense (deferred decision).
- [ ] Performance pass: query plans, N+1 audits.
- [ ] CRON cadence finalized for player ingest.
- [ ] Final pre-launch run-through with a friend on a fresh account.

---

## Out of scope (v1)

- Email / push notifications.
- Bench / chips (wildcard, triple captain, free hit) unless Aftonbladet's 2026 ruleset uses them.
- Multi-league / multi-tenant.
- In-app payments (we stay offline-Swish).
- Mobile app (PWA only if we ever care).
- Anything Spanish or Tunisian theme-related from the prior project.

---

## Notes for future me

- `RULES.md` does not exist yet. Create it during Epic 2 and link from `/how`.
- `BACKLOG.md` (this file) is the source of truth for *what we're building*. `CLAUDE.md` is the source of truth for *how the current code is laid out*. Keep both in sync.
- Money rounds. Always. Always. Always test rounding.
