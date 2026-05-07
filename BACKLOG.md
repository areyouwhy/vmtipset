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

- [x] Schema: `prize_pools` (key, label, allocationBps, active) + `prize_places` (poolId, place, shareBps). Basis points everywhere — integer-safe money math.
- [x] Default seed: 80% main league / 20% daily bets, with 50/30/20 and 60/40 place splits.
- [x] `/admin/config` UI: pot preview, pool allocation form, dynamic places editor (add/remove places per pool).
- [x] Pot math (`src/lib/prizes.ts`): pure, golden-master tested with rounding scenarios; remainder is surfaced, not silently absorbed.
- [x] `getPotPayout()`: pot = stake × approved count, then split into pools and places.
- [x] `/how` reads from DB now and renders the live prize structure.
- [x] 20 new tests (45 total).
- **Deferred:** rounds admin UI (set deadline, status, etc.) — stub `rounds` table exists from Epic 3, full admin UI lands when it's actually needed in Epic 5/7.
- **Deferred:** freeze logic ("can't edit past first scoring run") — placeholder for Epic 7.
- **Deferred:** rules-config DB editing. Rules stay in `src/lib/rules.ts` for now; only prize structure is editable from admin.

### Epic 5 — Squad picking + transfers (mode A)

**Phase A — schema + validation + tests ✓**
- [x] Schema: `squads` (team, round, captain, lockedAt), `squad_players`, `transfers`.
- [x] `validateSquad` covers: size, duplicates, position min/max, formation, budget, same-club, same-country, captain.
- [x] 16 squad-validation tests (61 total across 5 files).
- [x] Mock dataset bumped to 4 clubs × 10 players = 40 with prices that allow a legal 50M squad.

**Phase B — squad picker UI ✓**
- [x] `/app/squad` with `PLAN` (pitch) and `LISTA` (filterable list) tabs.
- [x] **PLAN view**: formation selector pills (legal formations from rules), pitch rows GK→FWD, dashed `+ POS` empty slots that flip to LISTA filtered by that position and auto-return on pick. Player chips show country code, position badge, captain `C`, remove `×`.
- [x] **LISTA view**: position pills + LAG (country) pills (48 nations), `BARA RÅD` (only affordable) and `BARA PLATS` (only fits all rules) toggles. Greys out unpickable players with reason badge (`EJ RÅD`, `POSITION FULL`, `KLUBB MAX`, `LAND MAX`).
- [x] Sticky compact summary at top: TRUPP/FORM/KVAR/©, position bounds, expandable error list.
- [x] Fixed save bar at bottom of viewport. Live error count next to label.
- [x] Server action re-validates with the same `validateSquad` and refuses on locked.
- [x] `/app` CTA flips between BYGG / REDIGERA / VISA based on squad state.

**Mock data tuned for testing:**
- 48 WC 2026 nations (CONMEBOL/UEFA/CONCACAF/AFC/CAF/OFC).
- 480 players (1 GK + 3 DEF + 3 MID + 3 FWD per nation), prices tiered by position rank × nation strength so a cheapest legal 4-3-3 ≈ 42.5M.
- 3 group-stage rounds with deterministic pseudo-random growth (fixed seed → reproducible scenarios).
- Admin `[ ! RENSA & RE-INGEST ]` button at `/admin/data` for clean iteration.

**Phase C — transfers between rounds (next)**
- [ ] When admin opens round N+1, inherit squad from round N.
- [ ] Transfer flow: out + in; fee = `transferFeePct × outgoing.price`; logged in `transfers`.
- [ ] Honor `freeTransfersPerRound` once it's > 0.

**Phase D — deadline lock**
- [ ] Server enforcement: refuse save if `now > round.deadline`.
- [ ] Auto-flip `squads.lockedAt` when deadline passes.
- [ ] UI countdown.

### Epic 6 — Daily/round bets (mode B)

- [ ] Schema: `bets` (id, round_id, question_text, answer_type: `player_ref` | `numeric`, deadline, correct_answer_player_id?, correct_answer_numeric?, points_value, status: `open` | `closed` | `scored`), `bet_answers` (bet_id, user_id, answer_player_id?, answer_numeric?, submitted_at).
- [ ] Admin UI: create bet (question + type + deadline + points). Reveal correct answer when ready.
- [ ] User UI: see open bets on `/app`; submit/edit answer until deadline.
- [ ] Scoring: when admin sets correct answer, mark bet `scored`, award points to matching answers.
- [ ] Numeric scoring: exact match only for v1.
- [ ] Tests: scoring under correct/wrong/null answers; double-submit prevention; deadline enforcement.

### Epic 7 — Round lifecycle + scoring (mode A) ✓

- [x] Schema: `team_round_scores` (team, round, components, total, `snapshotIdsUsed` audit array, computedAt). Unique per (team, round) so re-runs upsert cleanly.
- [x] Pure `scoreSquadForRound` in `src/lib/scoring.ts`. No DB calls. Components: sumGrowth, captainBonus (positive-only flag), bankInterest (floor of leftover × rate), transferFees deduction.
- [x] DB-coupled `scoreRound` in `src/lib/score-runner.ts`: loads squads, snapshots, transfers; calls pure fn per team; wipes + persists; locks squads; flips round status to `scored`. Idempotent.
- [x] `setRoundStatus`, `reopenRound` helpers.
- [x] `/admin/rounds` page: per-round status, deadline, squad/score counts, action buttons (ÖPPNA / LÅS / LÅS & POÄNGSÄTT / POÄNGSÄTT / KÖR OM POÄNG / ÅTERSTÄLL). Live result table after scoring.
- [x] 9 golden-master tests for scoring (zero growth + bank interest, mixed + captain × 2, captain-loss-not-doubled flag, captain-loss-doubled (flag off), transfer fees, over-budget, snapshot audit list, missing-snapshot warning, determinism).
- [x] Total tests: **70** across 6 files.
- **Deferred:** purchase price tracking on `squad_players` (need this once Phase 5C transfers land — then bank interest reflects what users actually paid, not current snapshot). For now, purchase prices = round-1 snapshot prices.

### Epic 8 — Leaderboards, detail views, audit ✓

- [x] `/leaderboard` (public): rank, ↑/↓ arrows vs previous scored round, per-team totals, per-round chip strip.
- [x] `/team/[id]` (public): squad per round (sorted GK→FWD, captain first), score breakdown, growth per player.
- [x] `/how/audit` (public): per-round audit with snapshot ids, prices, growth, captain markers — enough to hand-recompute any score.
- [x] `/app` shows the user's own rank + total + last round points; links to /leaderboard and /team/[id].
- [x] Landing page links to /leaderboard.
- **Deferred:** `/player/[id]` price/points history chart. Not blocking; can ship later.
- **Deferred:** daily-bets leaderboard column. Lands with Epic 6.
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
