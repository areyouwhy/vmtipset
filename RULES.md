# Rules

Living document. The values that the app actually uses live in `src/lib/rules.ts` — that file is the source of truth. This file is the human-readable explanation, with reasoning and a deviation log.

> **Status of source data:** Aftonbladet has not yet (as of 2026-05-07) published the WC 2026 Manager ruleset. The values below are inherited from the previous PL season (Aftonbladet ruleset id `193`) and **must be re-verified** when the WC 2026 ruleset is published. Each rule is tagged with its current status:
> - `IMPLEMENTED` — coded and tested
> - `IMPLEMENTED-UNVERIFIED` — coded and tested, but the *value* is a PL-era placeholder
> - `PLANNED` — backlog, not yet coded
> - `SKIPPED` — intentionally not implemented (with reason)
> - `DEVIATED` — implemented differently from Aftonbladet (with reason)

---

## League / squad

| Rule | Value | Status | Notes |
|---|---|---|---|
| Squad size | 11 starting players | IMPLEMENTED-UNVERIFIED | No bench in v1. |
| Budget | 50 000 000 SEK | IMPLEMENTED-UNVERIFIED | Standard PL budget. WC may differ. |
| Goalkeepers | exactly 1 | IMPLEMENTED-UNVERIFIED | |
| Defenders | 3–5 | IMPLEMENTED-UNVERIFIED | |
| Midfielders | 2–5 | IMPLEMENTED-UNVERIFIED | |
| Forwards | 1–3 | IMPLEMENTED-UNVERIFIED | |
| Legal formations | 3-4-3, 3-5-2, 4-3-3, 4-4-2, 4-5-1, 5-3-2, 5-4-1 | IMPLEMENTED-UNVERIFIED | |
| Max from same club | 3 | IMPLEMENTED-UNVERIFIED | PL standard. WC variant unclear — may instead cap by country. |
| Max from same country | none (yet) | PLANNED | Confirm against WC 2026 ruleset. |

## Captain

| Rule | Value | Status | Notes |
|---|---|---|---|
| Captain multiplier | 2× | IMPLEMENTED-UNVERIFIED | |
| Captain bonus only on positive growth | yes | IMPLEMENTED-UNVERIFIED | A captain whose growth is negative does **not** double the loss. Memory carry-over from prior project. |

## Transfers

| Rule | Value | Status | Notes |
|---|---|---|---|
| Free transfers per round | 0 | IMPLEMENTED-UNVERIFIED | Aftonbladet historically gave 0 free; every transfer charges the fee. |
| Transfer fee | 1% of the outgoing player's price | IMPLEMENTED-UNVERIFIED | |
| Transfer window | between rounds only (squad locked at deadline) | PLANNED | Implementation lands in Epic 5. |

## Scoring

| Rule | Value | Status | Notes |
|---|---|---|---|
| Per-player score | player price growth in that round (from Aftonbladet API) | PLANNED | Lands in Epic 7. |
| Captain bonus | `(multiplier - 1) × captain growth`, only if positive | PLANNED | |
| Bank interest | 1% on unspent budget per round | IMPLEMENTED-UNVERIFIED | Carry-over from prior project. |
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
