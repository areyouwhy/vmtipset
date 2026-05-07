CREATE TABLE "team_round_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"sum_growth_sek" integer NOT NULL,
	"captain_bonus_sek" integer NOT NULL,
	"bank_interest_sek" integer NOT NULL,
	"transfer_fees_sek" integer NOT NULL,
	"total_points_sek" integer NOT NULL,
	"snapshot_ids_used" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_round_score_unique" UNIQUE("team_id","round_id")
);
--> statement-breakpoint
ALTER TABLE "team_round_scores" ADD CONSTRAINT "team_round_scores_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_round_scores" ADD CONSTRAINT "team_round_scores_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;