# Rules

Living document. The values that the app actually uses live in `src/lib/rules.ts` — that file is the source of truth. This file is the human-readable explanation, with reasoning and a deviation log.

> **Status of source data:** Verified on 2026-05-14 against Aftonbladet's WC 2026 Manager ruleset (id `197`, `SoccerCupSimple Nations 2023`). Formations, position counts and the captain/transfer/bank rules are confirmed. Club/country caps and stake-related rules aren't in the ruleset JSON — they're league decisions we own; see the deviation log. Each rule is tagged with its current status:
> - `IMPLEMENTED` — coded and tested
> - `IMPLEMENTED-UNVERIFIED` — coded and tested, but the *value* is a placeholder pending external confirmation
> - `PLANNED` — backlog, not yet coded
> - `SKIPPED` — intentionally not implemented (with reason)
> - `DEVIATED` — implemented differently from Aftonbladet (with reason)

---

## League / squad

| Rule | Value | Status | Notes |
|---|---|---|---|
| Squad size | 11 starting players | IMPLEMENTED | No bench in v1. Ruleset 197 confirms 11 starters across all 7 formations. |
| Budget | 50 000 000 SEK | IMPLEMENTED | Not encoded in the ruleset JSON; matches Aftonbladet's WC squad-builder UI. |
| Goalkeepers | exactly 1 | IMPLEMENTED | Ruleset 197. |
| Defenders | 3–5 | IMPLEMENTED | Ruleset 197 — formations span 3–5 DEF. |
| Midfielders | 3–5 | IMPLEMENTED | Ruleset 197 — formations span 3–5 MID. (Was `2–5` in v0; corrected.) |
| Forwards | 1–3 | IMPLEMENTED | Ruleset 197. |
| Legal formations | 3-4-3, 3-5-2, 4-3-3, 4-4-2, 4-5-1, 5-3-2, 5-4-1 | IMPLEMENTED | Ruleset 197 — exactly these seven. |
| Max from same club | 3 | IMPLEMENTED | In WC fantasy a "club" is a national team, so this is effectively a max-3-per-country cap. League decision; not in ruleset JSON. |
| Max from same country | none (yet) | SKIPPED | Redundant — see `Max from same club`. |

## Captain

| Rule | Value | Status | Notes |
|---|---|---|---|
| Captain multiplier | 2× | IMPLEMENTED | League decision; same as Aftonbladet's UI. |
| Captain bonus only on positive growth | yes | IMPLEMENTED | A captain whose growth is negative does **not** double the loss. Carry-over from prior project, kept by choice. |

## Transfers

| Rule | Value | Status | Notes |
|---|---|---|---|
| Free transfers per round | 0 | IMPLEMENTED | Aftonbladet historically gives 0 free; every transfer charges the fee. |
| Transfer fee | 1% of the outgoing player's price | IMPLEMENTED | Matches Aftonbladet's UI behaviour. |
| Transfer window | between rounds only (squad locked at deadline) | PLANNED | Implementation lands in Epic 5. |

## Scoring

| Rule | Value | Status | Notes |
|---|---|---|---|
| Per-player score | player price growth in that round (from Aftonbladet API) | PLANNED | Lands in Epic 7. |
| Captain bonus | `(multiplier - 1) × captain growth`, only if positive | PLANNED | |
| Bank interest | 1% on unspent budget per round | IMPLEMENTED | Carry-over from prior project; not in the ruleset JSON. |
| Transfer fees | deducted from round score | PLANNED | |
| Tie-breakers | shared place, prize money split equally | PLANNED | Per BACKLOG default. |

## Money

| Rule | Value | Status | Notes |
|---|---|---|---|
| Stake per user | 300 SEK | IMPLEMENTED | Configured in `src/lib/swish.ts`. |
| Pot allocation: main league | 80% (default) | PLANNED | Editable in admin until first scoring run. |
| Pot allocation: daily/round bets | 20% (default) | PLANNED | |
| Place distribution | configurable per pool | PLANNED | Admin UI lands in Epic 4. |

## Bet of the day / round (mode B)

| Rule | Value | Status | Notes |
|---|---|---|---|
| Bet types | `player_ref` or `numeric` | PLANNED | |
| Numeric scoring | exact match only | PLANNED | Per BACKLOG default. May revisit. |
| Edit window | until bet deadline | PLANNED | Per BACKLOG default. |

## Side bets (mode C)

| Rule | Value | Status | Notes |
|---|---|---|---|
| Money involvement | none | DEVIATED | Aftonbladet has no equivalent; this is purely social. |
| Scoring | none — display only | SKIPPED | By design. |

## Skipped on purpose

| Feature | Why |
|---|---|
| Bench / substitutes | Adds rule surface and edge cases (auto-sub if starter doesn't play). v1 plays the picked XI as-is. |
| Chips (Wildcard, Triple Captain, Free Hit, Bench Boost) | Too many money-sensitive edge cases. |
| Email / push notifications | Out of scope for v1. |
| Real-time price updates | Daily cron is enough for the tournament cadence. |

---

## Deviation log

When we knowingly diverge from Aftonbladet's published rules, log it here with date and reason. Drives the `/how` page's "deviations" section.

| Date | Rule | Aftonbladet | Us | Why |
|---|---|---|---|---|
| (none yet) | | | | |

---

## How to update this document

1. Edit `src/lib/rules.ts` first — that's the source of truth the app reads.
2. Reflect the change in the table above.
3. If the change *deviates* from Aftonbladet's published rules, add a row to the deviation log.
4. If the change comes from re-verifying the Aftonbladet ruleset, update `meta.lastVerifiedAt` in `currentRules` and flip relevant `IMPLEMENTED-UNVERIFIED` rows to `IMPLEMENTED`.
