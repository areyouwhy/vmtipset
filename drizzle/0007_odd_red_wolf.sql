ALTER TABLE "player_round_snapshots" ADD COLUMN "total_growth_sek" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_round_snapshots" ADD COLUMN "popularity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_round_snapshots" ADD COLUMN "trend" smallint DEFAULT 0 NOT NULL;