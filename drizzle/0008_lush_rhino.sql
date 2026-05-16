ALTER TABLE "team_round_scores" ADD COLUMN "transfer_cash_flow_sek" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "team_round_scores" ADD COLUMN "bank_sek_end" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "transfers" ADD COLUMN "sell_price_sek" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "transfers" ADD COLUMN "buy_price_sek" integer NOT NULL;