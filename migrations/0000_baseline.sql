-- Baseline schema. Written to be idempotent so it works on:
--   * a brand new, empty database
--   * databases created earlier with `drizzle-kit push` (including older Replit-era shapes)
-- Every statement is "create if missing" / "add if missing"; nothing is ever dropped.

CREATE TABLE IF NOT EXISTS "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "first_name" varchar;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_name" varchar;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "profile_image_url" varchar;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "balance" bigint DEFAULT 50000 NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tokens" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "total_wins" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "max_win" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "streak" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "max_streak" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "games_played" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_admin" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_daily_bonus_at" timestamp;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now();
--> statement-breakpoint
-- Older databases stored these as int4, which overflows at 2.1 billion
ALTER TABLE "users" ALTER COLUMN "balance" SET DATA TYPE bigint;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "balance" SET DEFAULT 50000;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "max_win" SET DATA TYPE bigint;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_username_unique') THEN
		ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE ("username");
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_email_unique') THEN
		ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE ("email");
	END IF;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "game_states" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"slot_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_states" ADD COLUMN IF NOT EXISTS "active_modifier" integer DEFAULT 100;
--> statement-breakpoint
ALTER TABLE "game_states" ADD COLUMN IF NOT EXISTS "free_spins" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "game_states" ADD COLUMN IF NOT EXISTS "free_spin_bet" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "game_states" ADD COLUMN IF NOT EXISTS "last_oracle_at" timestamp;
--> statement-breakpoint
ALTER TABLE "game_states" ADD COLUMN IF NOT EXISTS "consecutive_wins" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "game_states" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now();
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_game_states_user" ON "game_states" ("user_id", "slot_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "achievements" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"badge_id" text NOT NULL,
	"badge_name" text NOT NULL,
	"description" text NOT NULL,
	"icon" text NOT NULL,
	"unlocked_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_achievements_user" ON "achievements" ("user_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "deposits" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"amount" integer NOT NULL,
	"method" text NOT NULL,
	"card_code" text,
	"status" text DEFAULT 'completed' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_deposits_user" ON "deposits" ("user_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "gift_cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"denomination" integer NOT NULL,
	"is_redeemed" boolean DEFAULT false NOT NULL,
	"redeemed_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"redeemed_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gift_cards_code_unique') THEN
		ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_code_unique" UNIQUE ("code");
	END IF;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "withdrawals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"amount" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "session" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" json NOT NULL,
	"expire" timestamp (6) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" USING btree ("expire");
