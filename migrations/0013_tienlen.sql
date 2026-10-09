-- Tiến Lên games against the computer
CREATE TABLE IF NOT EXISTS "tienlen_games" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"stake" integer NOT NULL,
	"state" jsonb NOT NULL,
	"finished" boolean DEFAULT false NOT NULL,
	"place" integer,
	"payout" bigint,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tienlen_games_user" ON "tienlen_games" USING btree ("user_id","finished");