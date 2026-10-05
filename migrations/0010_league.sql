-- Pool league: seasons, counted games, daily first-win bonus
CREATE TABLE IF NOT EXISTS "league_seasons" (
	"season" text PRIMARY KEY NOT NULL,
	"paid_at" timestamp DEFAULT now() NOT NULL,
	"summary" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pool_matches" ADD COLUMN IF NOT EXISTS "shots" integer;--> statement-breakpoint
ALTER TABLE "pool_matches" ADD COLUMN IF NOT EXISTS "season" text;--> statement-breakpoint
ALTER TABLE "pool_matches" ADD COLUMN IF NOT EXISTS "counted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_pool_bonus_at" timestamp;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pool_matches_season" ON "pool_matches" USING btree ("season","counted");