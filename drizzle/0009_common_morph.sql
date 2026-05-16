CREATE TABLE "fantasy_event_types" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"short_title" text,
	"value_sek" integer NOT NULL,
	"image_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "player_round_snapshots" ADD COLUMN "events" jsonb DEFAULT '[]'::jsonb NOT NULL;