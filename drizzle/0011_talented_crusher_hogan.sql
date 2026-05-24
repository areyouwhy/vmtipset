CREATE TABLE "ingest_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" text NOT NULL,
	"trigger" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean DEFAULT false NOT NULL,
	"summary" jsonb,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "squads" ADD COLUMN "invalid" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "squads" ADD COLUMN "invalid_reason" text;