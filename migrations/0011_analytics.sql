-- Admin analytics: one row per game played, and the days each player was active
CREATE TABLE IF NOT EXISTS "game_plays" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"game" text NOT NULL,
	"bet" bigint NOT NULL,
	"payout" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_days" (
	"user_id" varchar NOT NULL,
	"day" text NOT NULL,
	CONSTRAINT "user_days_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_plays_created" ON "game_plays" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_plays_user" ON "game_plays" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_days_day" ON "user_days" USING btree ("day");--> statement-breakpoint
-- What we already know: the day each player joined and the day they were last seen (Vietnam time)
INSERT INTO "user_days" ("user_id", "day")
	SELECT "id", to_char("created_at" + interval '7 hours', 'YYYY-MM-DD') FROM "users" WHERE "created_at" IS NOT NULL
	UNION
	SELECT "id", to_char("last_seen_at" + interval '7 hours', 'YYYY-MM-DD') FROM "users" WHERE "last_seen_at" IS NOT NULL
ON CONFLICT DO NOTHING;
