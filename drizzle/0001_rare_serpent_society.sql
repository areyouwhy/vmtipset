CREATE TYPE "public"."player_position" AS ENUM('GK', 'DEF', 'MID', 'FWD');--> statement-breakpoint
CREATE TYPE "public"."round_status" AS ENUM('upcoming', 'open', 'locked', 'scored');--> statement-breakpoint
CREATE TYPE "public"."snapshot_source" AS ENUM('api', 'manual');--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text,
	"name" text NOT NULL,
	"short_name" text,
	"country_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clubs_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "player_round_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"price_sek" integer NOT NULL,
	"growth_sek" integer DEFAULT 0 NOT NULL,
	"source" "snapshot_source" NOT NULL,
	"notes" text,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_round_source_unique" UNIQUE("player_id","round_id","source")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text,
	"name" text NOT NULL,
	"club_id" uuid,
	"position" "player_position" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text,
	"number" integer NOT NULL,
	"name" text NOT NULL,
	"status" "round_status" DEFAULT 'upcoming' NOT NULL,
	"deadline" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rounds_external_id_unique" UNIQUE("external_id"),
	CONSTRAINT "rounds_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "player_round_snapshots" ADD CONSTRAINT "player_round_snapshots_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_round_snapshots" ADD CONSTRAINT "player_round_snapshots_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;