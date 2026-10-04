-- Blackjack: one row per hand; a hand in progress keeps the shoe and hole card server-side
CREATE TABLE IF NOT EXISTS "blackjack_hands" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"state" jsonb NOT NULL,
	"finished" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "blackjack_one_active_hand" ON "blackjack_hands" ("user_id") WHERE "finished" = false;
