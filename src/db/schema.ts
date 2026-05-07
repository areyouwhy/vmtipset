import {
  boolean,
  integer,
  pgEnum,
  pgTable,
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
 * Immutable snapshot of a player's price + round-over-round growth, attributed
 * to a source (Aftonbladet API or a manual admin override). Unique per
 * (player, round, source) so the API value and a manual correction can
 * coexist; scoring prefers `manual` when both are present.
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
    source: snapshotSource("source").notNull(),
    notes: text("notes"),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("player_round_source_unique").on(t.playerId, t.roundId, t.source),
  ],
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
export type PrizePool = typeof prizePools.$inferSelect;
export type NewPrizePool = typeof prizePools.$inferInsert;
export type PrizePlace = typeof prizePlaces.$inferSelect;
export type NewPrizePlace = typeof prizePlaces.$inferInsert;

export type Position = (typeof playerPosition.enumValues)[number];
export type RoundStatus = (typeof roundStatus.enumValues)[number];
export type SnapshotSource = (typeof snapshotSource.enumValues)[number];
export type PrizePoolKey = (typeof prizePoolKey.enumValues)[number];
