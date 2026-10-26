-- Darts: online matches, the Daily Challenge (one ranked attempt per day), its prizes, and the daily first-win reward
CREATE TABLE IF NOT EXISTS "darts_daily" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"day" text NOT NULL,
	"darts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "darts_daily_results" (
	"day" text PRIMARY KEY NOT NULL,
	"paid_at" timestamp DEFAULT now() NOT NULL,
	"summary" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "darts_matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"player1" varchar NOT NULL,
	"player2" varchar,
	"stake" integer NOT NULL,
	"legs" integer DEFAULT 1 NOT NULL,
	"status" text NOT NULL,
	"winner" varchar,
	"reason" text,
	"created_at" timestamp DEFAULT now(),
	"finished_at" timestamp,
	CONSTRAINT "darts_matches_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "darts_rewards" (
	"user_id" varchar NOT NULL,
	"day" text NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "darts_rewards_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "darts_daily_user_day" ON "darts_daily" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "darts_daily_day" ON "darts_daily" USING btree ("day","score");
