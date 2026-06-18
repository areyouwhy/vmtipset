import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// ─── Users / teams ──────────────────────────────────────────────────────────

export const userStatus = pgEnum("user_status", [
  "pending",
  "approved",
  "rejected",
]);

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name"),
  status: userStatus("status").notNull().default("pending"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: text("owner_user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Player data ────────────────────────────────────────────────────────────

export const playerPosition = pgEnum("player_position", [
  "GK",
  "DEF",
  "MID",
  "FWD",
]);

export const roundStatus = pgEnum("round_status", [
  "upcoming",
  "open",
  "locked",
  "scored",
]);

export const snapshotSource = pgEnum("snapshot_source", ["api", "manual"]);

export const prizePoolKey = pgEnum("prize_pool_key", [
  "main_league",
  "daily_bets",
]);

export const betAnswerType = pgEnum("bet_answer_type", [
  "player_ref",
  "numeric",
]);

export const betStatus = pgEnum("bet_status", [
  "open",
  "closed",
  "scored",
]);

export const clubs = pgTable("clubs", {
  id: uuid("id").primaryKey().defaultRandom(),
  externalId: text("external_id").unique(),
  name: text("name").notNull(),
  shortName: text("short_name"),
  countryCode: text("country_code"), // ISO 3166-1 alpha-3
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const players = pgTable("players", {
  id: uuid("id").primaryKey().defaultRandom(),
  externalId: text("external_id").unique(),
  name: text("name").notNull(),
  clubId: uuid("club_id").references(() => clubs.id, { onDelete: "set null" }),
  position: playerPosition("position").notNull(),
  active: boolean("active").notNull().default(true),
  /** Set when the ingest source drops a player (orphan). Picker hides them;
   *  any squad still holding them gets marked invalid. Soft-delete so we can
   *  un-archive if Aftonbladet re-adds them under the same external id. */
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const rounds = pgTable("rounds", {
  id: uuid("id").primaryKey().defaultRandom(),
  externalId: text("external_id").unique(),
  number: integer("number").notNull().unique(),
  name: text("name").notNull(),
  status: roundStatus("status").notNull().default("upcoming"),
  deadline: timestamp("deadline", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Snapshot of a player's value for a (round, source) pair. API rows upsert on
 * conflict — prices and growth can drift mid-round at Aftonbladet, so we keep
 * the latest. Manual rows are written through a separate admin path; scoring
 * prefers `manual` when both exist.
 */
export const playerRoundSnapshots = pgTable(
  "player_round_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    roundId: uuid("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "cascade" }),
    priceSek: integer("price_sek").notNull(),
    growthSek: integer("growth_sek").notNull().default(0),
    /** Cumulative SEK growth across the tournament through this round. */
    totalGrowthSek: integer("total_growth_sek").notNull().default(0),
    /** Fraction of Aftonbladet squads owning this player, 0..1. Multiply by
     *  100 to render as a percentage. Aftonbladet used to return a raw squad
     *  count here but switched to a fraction during the 2026 WC rollout, so
     *  this is `real` not `integer`. */
    popularity: real("popularity").notNull().default(0),
    /** -1 = falling, 0 = flat, +1 = rising. Aftonbladet's own indicator. */
    trend: smallint("trend").notNull().default(0),
    source: snapshotSource("source").notNull(),
    notes: text("notes"),
    /** Per-round scoring events from Aftonbladet — array of
     *  {typeId, amount}. typeId joins to fantasyEventTypes. Sum of
     *  (amount × valueSek) over this array should equal growthSek
     *  (modulo Aftonbladet rounding). Empty array pre-match. */
    events: jsonb("events")
      .notNull()
      .default([])
      .$type<Array<{ typeId: number; amount: number }>>(),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("player_round_source_unique").on(t.playerId, t.roundId, t.source),
  ],
);

/**
 * Raw event taxonomy from Aftonbladet (Goal, Lineup, Assist, Benched, …).
 * These are the IDs that appear inside `player_round_snapshots.events[].typeId`.
 * Used purely to resolve a human-readable name when rendering events per
 * player per round. SEK values are NOT here — see `fantasyEventTypes`.
 */
export const eventTypes = pgTable("event_types", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  title: text("title").notNull(),
  abbreviation: text("abbreviation"),
  imageUrl: text("image_url"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Aftonbladet's fantasy SCORING catalog — the position-aware rules that
 * decide how much each event is worth in SEK. e.g., SoccerStrikerGoal=125k,
 * SoccerDefenseGoal=175k. Surfaced on `/hur` as the canonical "rules of
 * the game" table. IDs are independent from `eventTypes`.
 */
export const fantasyEventTypes = pgTable("fantasy_event_types", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  title: text("title").notNull(),
  shortTitle: text("short_title"),
  valueSek: integer("value_sek").notNull(),
  imageUrl: text("image_url"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Audit log of every ingest run (cron-triggered or admin-triggered). Lets us
 * answer "did the cron actually run yesterday, and what did it change?"
 * without doing DB forensics. Stored summary mirrors IngestSummary shape.
 */
export const ingestRuns = pgTable("ingest_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceId: text("source_id").notNull(),
  /** "cron" | "admin" — who fired it. */
  trigger: text("trigger").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  ok: boolean("ok").notNull().default(false),
  /** Full IngestSummary on success, or partial summary if we got far enough. */
  summary: jsonb("summary").$type<Record<string, unknown>>(),
  error: text("error"),
});

// ─── Squads ─────────────────────────────────────────────────────────────────

/**
 * A squad is a team's lineup for a specific round. Round 1 is the initial
 * pick; subsequent rounds inherit the previous squad and apply transfers.
 * Locked once the round deadline passes; unique per (team, round).
 */
export const squads = pgTable(
  "squads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    roundId: uuid("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "cascade" }),
    captainPlayerId: uuid("captain_player_id").references(() => players.id, {
      onDelete: "restrict",
    }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    /** Set true by the ingest when this squad contains a player that the
     *  source has dropped. UI surfaces a banner + re-pick CTA. Cleared when
     *  the user rebuilds the squad without the offending player(s). */
    invalid: boolean("invalid").notNull().default(false),
    invalidReason: text("invalid_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("squad_team_round_unique").on(t.teamId, t.roundId)],
);

export const squadPlayers = pgTable(
  "squad_players",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    squadId: uuid("squad_id")
      .notNull()
      .references(() => squads.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "restrict" }),
  },
  (t) => [unique("squad_player_unique").on(t.squadId, t.playerId)],
);

/**
 * Append-only log of every transfer between rounds. Each row reduces the
 * team's round score by `feeSek`.
 */
export const transfers = pgTable("transfers", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  roundId: uuid("round_id")
    .notNull()
    .references(() => rounds.id, { onDelete: "cascade" }),
  playerInId: uuid("player_in_id")
    .notNull()
    .references(() => players.id, { onDelete: "restrict" }),
  playerOutId: uuid("player_out_id")
    .notNull()
    .references(() => players.id, { onDelete: "restrict" }),
  /** Market price of the outgoing player at the moment of the swap. Goes
   *  into the bank as a credit. */
  sellPriceSek: integer("sell_price_sek").notNull(),
  /** Market price of the incoming player. Debits the bank. */
  buyPriceSek: integer("buy_price_sek").notNull(),
  feeSek: integer("fee_sek").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Daily / round bets (game mode B) ────────────────────────────────────────

/**
 * A single bet posted by admin. Answer type determines whether the truth and
 * each user's answer are a player ref (uuid) or a plain integer.
 *
 * `roundId` is optional grouping — convenient for "MD1 bets" but not required.
 */
export const bets = pgTable("bets", {
  id: uuid("id").primaryKey().defaultRandom(),
  roundId: uuid("round_id").references(() => rounds.id, {
    onDelete: "set null",
  }),
  question: text("question").notNull(),
  answerType: betAnswerType("answer_type").notNull(),
  deadline: timestamp("deadline", { withTimezone: true }),
  correctAnswerPlayerId: uuid("correct_answer_player_id").references(
    () => players.id,
    { onDelete: "set null" },
  ),
  correctAnswerNumeric: integer("correct_answer_numeric"),
  pointsValue: integer("points_value").notNull().default(100),
  status: betStatus("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Side bets (mode C) — display-only, no scoring, no money. Admin posts a
 * question and later fills in the resolution as plain text. Pure social.
 */
export const sideBets = pgTable("side_bets", {
  id: uuid("id").primaryKey().defaultRandom(),
  question: text("question").notNull(),
  resolution: text("resolution"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * One answer per (bet, team). `pointsAwarded` is filled by the scoring step
 * once admin sets the correct answer; until then it's 0.
 */
export const betAnswers = pgTable(
  "bet_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    betId: uuid("bet_id")
      .notNull()
      .references(() => bets.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    answerPlayerId: uuid("answer_player_id").references(() => players.id, {
      onDelete: "set null",
    }),
    answerNumeric: integer("answer_numeric"),
    pointsAwarded: integer("points_awarded").notNull().default(0),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("bet_answer_unique").on(t.betId, t.teamId)],
);

/**
 * Computed score per (team, round). Re-running scoring for a round is allowed
 * and produces identical output for the same inputs — we wipe + reinsert.
 * `snapshotIdsUsed` is the audit trail: which snapshot rows actually fed into
 * the score, so anyone can recompute by hand.
 */
export const teamRoundScores = pgTable(
  "team_round_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    roundId: uuid("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "cascade" }),
    /** Sum of player price growth this round = Δ squad value from price drift. */
    sumGrowthSek: integer("sum_growth_sek").notNull(),
    /** Captain growth × (multiplier − 1), credited to bank. */
    captainBonusSek: integer("captain_bonus_sek").notNull(),
    /** floor(bankLocked × interestRate), credited to bank. */
    bankInterestSek: integer("bank_interest_sek").notNull(),
    /** Sum of transfer fees this round, debited from bank. */
    transferFeesSek: integer("transfer_fees_sek").notNull(),
    /** Net cash impact of round-N transfers on bank: Σ(sell − buy). Excludes fees. */
    transferCashFlowSek: integer("transfer_cash_flow_sek").notNull().default(0),
    /** Bank balance after transfers + interest + captain credit. Persistent. */
    bankSekEnd: integer("bank_sek_end").notNull().default(0),
    /** Δ team value = sumGrowth (squad change) + captain + interest − fees + cashFlow.
     *  Equals (squad_value_N + bank_end_N) − (squad_value_{N-1} + bank_end_{N-1}). */
    totalPointsSek: integer("total_points_sek").notNull(),
    snapshotIdsUsed: jsonb("snapshot_ids_used").notNull().$type<string[]>(),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("team_round_score_unique").on(t.teamId, t.roundId)],
);

// ─── Prize pools ────────────────────────────────────────────────────────────

/**
 * Allocation of the total pot across game modes (main league vs daily bets).
 * Stored in basis points (10000 = 100%) to keep all money math integer-safe.
 * The sum of allocationBps across active rows must equal 10000.
 */
export const prizePools = pgTable("prize_pools", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: prizePoolKey("key").notNull().unique(),
  label: text("label").notNull(),
  allocationBps: integer("allocation_bps").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Per-place share of a pool, in basis points. Sum per pool must equal 10000.
 * Place starts at 1 and increments without gaps.
 */
export const prizePlaces = pgTable(
  "prize_places",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    poolId: uuid("pool_id")
      .notNull()
      .references(() => prizePools.id, { onDelete: "cascade" }),
    place: integer("place").notNull(),
    shareBps: integer("share_bps").notNull(),
  },
  (t) => [unique("pool_place_unique").on(t.poolId, t.place)],
);

// ─── Rivalry votes (the /hets banter sub-games) ─────────────────────────────
// Isolated from the game graph on purpose: no FK to users/teams, so it never
// affects scoring or the player-side cascade. One changeable vote per
// (rivalry, Clerk user). userId is the Clerk id (matches users.id), stored
// loosely so even users who've never hit /app (no users row) can still vote.

export const rivalryVotes = pgTable(
  "rivalry_votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rivalrySlug: text("rivalry_slug").notNull(),
    userId: text("user_id").notNull(),
    sideKey: text("side_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("rivalry_vote_unique").on(t.rivalrySlug, t.userId)],
);

/**
 * Emoji reactions (e.g. the /hets/fades hall of shame). Isolated like
 * rivalry_votes — no FK to the game graph. One row per (target, emoji, user);
 * re-clicking the same emoji toggles it off. `targetKey` namespaces what's
 * reacted to, e.g. "fades:kajler-spara". Created on prod via manual CREATE
 * TABLE (the migration baseline is unseeded — see CLAUDE.md Migrations).
 */
export const reactions = pgTable(
  "reactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetKey: text("target_key").notNull(),
    emoji: text("emoji").notNull(),
    userId: text("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("reaction_unique").on(t.targetKey, t.emoji, t.userId)],
);

/**
 * Pre-transfers ("förhandsval"): a draft squad a user prepares for an upcoming
 * round BEFORE the trading window opens. Deliberately isolated from the live
 * game — nothing in scoring / leaderboard / squad reads this table. When the
 * admin opens the round, `applyDraftsForRound` re-validates each pending draft
 * against the then-current prices and commits it via the same engine as a
 * manual save (status → `applied`), or leaves the carried-forward squad
 * untouched and records why (status → `rejected`). One draft per (team, round).
 *
 * `status` is a plain text column (not a pg enum) so the table can be created
 * on prod with a single manual CREATE TABLE — no CREATE TYPE — keeping this
 * additive change zero-risk to existing data (see CLAUDE.md Migrations).
 */
export const squadDrafts = pgTable(
  "squad_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    roundId: uuid("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "cascade" }),
    /** Intended starting XI, by player id. */
    playerIds: jsonb("player_ids").notNull().$type<string[]>(),
    captainPlayerId: uuid("captain_player_id").references(() => players.id, {
      onDelete: "set null",
    }),
    /** pending → applied | rejected | superseded. */
    status: text("status")
      .notNull()
      .default("pending")
      .$type<"pending" | "applied" | "rejected" | "superseded">(),
    /** Human-readable reason when status = rejected (e.g. budget overrun). */
    rejectReason: text("reject_reason"),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("squad_draft_team_round_unique").on(t.teamId, t.roundId)],
);

// ─── Inferred types ─────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type Club = typeof clubs.$inferSelect;
export type NewClub = typeof clubs.$inferInsert;
export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
export type Round = typeof rounds.$inferSelect;
export type NewRound = typeof rounds.$inferInsert;
export type PlayerRoundSnapshot = typeof playerRoundSnapshots.$inferSelect;
export type NewPlayerRoundSnapshot = typeof playerRoundSnapshots.$inferInsert;
export type EventType = typeof eventTypes.$inferSelect;
export type NewEventType = typeof eventTypes.$inferInsert;
export type FantasyEventType = typeof fantasyEventTypes.$inferSelect;
export type NewFantasyEventType = typeof fantasyEventTypes.$inferInsert;
export type PrizePool = typeof prizePools.$inferSelect;
export type NewPrizePool = typeof prizePools.$inferInsert;
export type PrizePlace = typeof prizePlaces.$inferSelect;
export type NewPrizePlace = typeof prizePlaces.$inferInsert;
export type Squad = typeof squads.$inferSelect;
export type NewSquad = typeof squads.$inferInsert;
export type SquadPlayer = typeof squadPlayers.$inferSelect;
export type NewSquadPlayer = typeof squadPlayers.$inferInsert;
export type Transfer = typeof transfers.$inferSelect;
export type NewTransfer = typeof transfers.$inferInsert;
export type TeamRoundScore = typeof teamRoundScores.$inferSelect;
export type NewTeamRoundScore = typeof teamRoundScores.$inferInsert;
export type Bet = typeof bets.$inferSelect;
export type NewBet = typeof bets.$inferInsert;
export type BetAnswer = typeof betAnswers.$inferSelect;
export type NewBetAnswer = typeof betAnswers.$inferInsert;
export type SideBet = typeof sideBets.$inferSelect;
export type NewSideBet = typeof sideBets.$inferInsert;
export type BetAnswerType = (typeof betAnswerType.enumValues)[number];
export type BetStatus = (typeof betStatus.enumValues)[number];
export type IngestRun = typeof ingestRuns.$inferSelect;
export type NewIngestRun = typeof ingestRuns.$inferInsert;

export type RivalryVote = typeof rivalryVotes.$inferSelect;
export type NewRivalryVote = typeof rivalryVotes.$inferInsert;

export type Reaction = typeof reactions.$inferSelect;
export type NewReaction = typeof reactions.$inferInsert;

export type SquadDraft = typeof squadDrafts.$inferSelect;
export type NewSquadDraft = typeof squadDrafts.$inferInsert;
export type DraftStatus = "pending" | "applied" | "rejected" | "superseded";

export type Position = (typeof playerPosition.enumValues)[number];
export type RoundStatus = (typeof roundStatus.enumValues)[number];
export type SnapshotSource = (typeof snapshotSource.enumValues)[number];
export type PrizePoolKey = (typeof prizePoolKey.enumValues)[number];
