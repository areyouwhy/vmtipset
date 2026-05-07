CREATE TYPE "public"."bet_answer_type" AS ENUM('player_ref', 'numeric');--> statement-breakpoint
CREATE TYPE "public"."bet_status" AS ENUM('open', 'closed', 'scored');--> statement-breakpoint
CREATE TABLE "bet_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bet_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"answer_player_id" uuid,
	"answer_numeric" integer,
	"points_awarded" integer DEFAULT 0 NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bet_answer_unique" UNIQUE("bet_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "bets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid,
	"question" text NOT NULL,
	"answer_type" "bet_answer_type" NOT NULL,
	"deadline" timestamp with time zone,
	"correct_answer_player_id" uuid,
	"correct_answer_numeric" integer,
	"points_value" integer DEFAULT 100 NOT NULL,
	"status" "bet_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bet_answers" ADD CONSTRAINT "bet_answers_bet_id_bets_id_fk" FOREIGN KEY ("bet_id") REFERENCES "public"."bets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bet_answers" ADD CONSTRAINT "bet_answers_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bet_answers" ADD CONSTRAINT "bet_answers_answer_player_id_players_id_fk" FOREIGN KEY ("answer_player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_correct_answer_player_id_players_id_fk" FOREIGN KEY ("correct_answer_player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;