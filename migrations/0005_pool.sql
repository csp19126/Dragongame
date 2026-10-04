-- Online pool matches (stakes held while a game is on)
CREATE TABLE IF NOT EXISTS "pool_matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"player1" varchar NOT NULL,
	"player2" varchar,
	"stake" integer NOT NULL,
	"status" text NOT NULL,
	"winner" varchar,
	"reason" text,
	"created_at" timestamp DEFAULT now(),
	"finished_at" timestamp,
	CONSTRAINT "pool_matches_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pool_matches_status" ON "pool_matches" ("status");
