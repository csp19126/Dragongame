-- Penalty shootout (Sút Phạt Đền): online matches, the weekly Penalty King ladder and its payouts
CREATE TABLE IF NOT EXISTS "football_matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"player1" varchar NOT NULL,
	"player2" varchar,
	"stake" integer NOT NULL,
	"status" text NOT NULL,
	"winner" varchar,
	"reason" text,
	"score" text,
	"kicks" jsonb,
	"week" text,
	"counted" boolean DEFAULT false NOT NULL,
	"elo_delta" integer,
	"created_at" timestamp DEFAULT now(),
	"finished_at" timestamp,
	CONSTRAINT "football_matches_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "football_ratings" (
	"user_id" varchar NOT NULL,
	"week" text NOT NULL,
	"rating" integer NOT NULL,
	"played" integer DEFAULT 0 NOT NULL,
	"won" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "football_ratings_user_id_week_pk" PRIMARY KEY("user_id","week")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "football_weeks" (
	"week" text PRIMARY KEY NOT NULL,
	"paid_at" timestamp DEFAULT now() NOT NULL,
	"summary" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_football_bonus_at" timestamp;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "football_matches_week" ON "football_matches" USING btree ("week","counted");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "football_ratings_week" ON "football_ratings" USING btree ("week","rating");
