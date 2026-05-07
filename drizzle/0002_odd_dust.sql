CREATE TYPE "public"."prize_pool_key" AS ENUM('main_league', 'daily_bets');--> statement-breakpoint
CREATE TABLE "prize_places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pool_id" uuid NOT NULL,
	"place" integer NOT NULL,
	"share_bps" integer NOT NULL,
	CONSTRAINT "pool_place_unique" UNIQUE("pool_id","place")
);
--> statement-breakpoint
CREATE TABLE "prize_pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" "prize_pool_key" NOT NULL,
	"label" text NOT NULL,
	"allocation_bps" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prize_pools_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "prize_places" ADD CONSTRAINT "prize_places_pool_id_prize_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."prize_pools"("id") ON DELETE cascade ON UPDATE no action;