-- Meet (dating, opt-in): profiles and 💛 between players
CREATE TABLE IF NOT EXISTS "dating_likes" (
	"from_id" varchar NOT NULL,
	"to_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dating_likes_from_id_to_id_pk" PRIMARY KEY("from_id","to_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dating_profiles" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"open" boolean DEFAULT false NOT NULL,
	"looking_for" text DEFAULT 'chat' NOT NULL,
	"birth_year" integer,
	"gender" text,
	"seeking" text[] DEFAULT '{}'::text[] NOT NULL,
	"age_min" integer DEFAULT 18 NOT NULL,
	"age_max" integer DEFAULT 99 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dating_likes_to" ON "dating_likes" USING btree ("to_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dating_profiles_open" ON "dating_profiles" USING btree ("open","updated_at");