-- Pool tournaments: entrants, bracket matches, prizes
CREATE TABLE IF NOT EXISTS "tournament_matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"round" integer NOT NULL,
	"slot" integer NOT NULL,
	"player1" varchar,
	"player2" varchar,
	"name1" text,
	"name2" text,
	"status" text NOT NULL,
	"code" text,
	"winner_id" varchar,
	"reason" text,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tournament_players" (
	"tournament_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"username" text NOT NULL,
	"place" integer,
	"prize" bigint,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tournament_players_tournament_id_user_id_pk" PRIMARY KEY("tournament_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tournaments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"starts_at" timestamp NOT NULL,
	"size" integer NOT NULL,
	"prizes" jsonb NOT NULL,
	"status" text NOT NULL,
	"auto" boolean DEFAULT false NOT NULL,
	"rounds" integer,
	"winner_id" varchar,
	"winner_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tournament_matches_slot" ON "tournament_matches" USING btree ("tournament_id","round","slot");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tournaments_status" ON "tournaments" USING btree ("status");