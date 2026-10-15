-- Đua Ngựa: races and bets
CREATE TABLE IF NOT EXISTS "horse_bets" (
	"id" serial PRIMARY KEY NOT NULL,
	"round" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"horse" integer NOT NULL,
	"amount" bigint NOT NULL,
	"odds" integer NOT NULL,
	"payout" bigint,
	"settled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "horse_rounds" (
	"round" integer PRIMARY KEY NOT NULL,
	"chances" jsonb NOT NULL,
	"odds" jsonb NOT NULL,
	"winner" integer NOT NULL,
	"finish_order" jsonb NOT NULL,
	"seed" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "horse_bets_round" ON "horse_bets" USING btree ("round","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "horse_bets_unsettled" ON "horse_bets" USING btree ("settled","round");
