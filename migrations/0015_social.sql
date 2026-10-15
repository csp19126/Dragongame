-- Social: profile photos, private messages, blocks and reports
CREATE TABLE IF NOT EXISTS "direct_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_id" varchar NOT NULL,
	"to_id" varchar NOT NULL,
	"text" text,
	"sticker" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"read_at" timestamp,
	"deleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dm_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" integer NOT NULL,
	"reporter_id" varchar NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profile_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"reporter_id" varchar NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_avatars" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"data" bytea NOT NULL,
	"mime" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_blocks" (
	"blocker_id" varchar NOT NULL,
	"blocked_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "direct_messages_pair" ON "direct_messages" USING btree ("from_id","to_id","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "direct_messages_to" ON "direct_messages" USING btree ("to_id","read_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "direct_messages_created" ON "direct_messages" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dm_reports_once" ON "dm_reports" USING btree ("message_id","reporter_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "profile_reports_once" ON "profile_reports" USING btree ("user_id","reporter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_blocks_blocked" ON "user_blocks" USING btree ("blocked_id");