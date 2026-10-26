-- Social 3: game invites (DM cards), clubs, daily quests, Moments
CREATE TABLE IF NOT EXISTS "club_chat_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" integer NOT NULL,
	"reporter_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "club_members" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"club_id" integer NOT NULL,
	"role" text NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "club_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"club_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"username" text NOT NULL,
	"text" text,
	"sticker" text,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "club_requests" (
	"club_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "club_requests_club_id_user_id_pk" PRIMARY KEY("club_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "club_reward_payouts" (
	"week" text NOT NULL,
	"user_id" varchar NOT NULL,
	"club_id" integer NOT NULL,
	"rank" integer NOT NULL,
	"amount" integer NOT NULL,
	CONSTRAINT "club_reward_payouts_week_user_id_pk" PRIMARY KEY("week","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "club_weeks" (
	"week" text PRIMARY KEY NOT NULL,
	"winners" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"paid_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clubs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tag" text NOT NULL,
	"emblem" text NOT NULL,
	"color" text NOT NULL,
	"description" text,
	"open" boolean DEFAULT true NOT NULL,
	"owner_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daily_quests" (
	"user_id" varchar NOT NULL,
	"day" text NOT NULL,
	"slot" integer NOT NULL,
	"quest_id" text NOT NULL,
	"notified" boolean DEFAULT false NOT NULL,
	"claimed_at" timestamp,
	CONSTRAINT "daily_quests_user_id_day_slot_pk" PRIMARY KEY("user_id","day","slot")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "moment_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"moment_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"text" text NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "moment_likes" (
	"moment_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "moment_likes_moment_id_user_id_pk" PRIMARY KEY("moment_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "moment_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"target_id" integer NOT NULL,
	"reporter_id" varchar NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "moments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"text" text,
	"sticker" text,
	"play_id" integer,
	"win" jsonb,
	"likes" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quest_chests" (
	"user_id" varchar NOT NULL,
	"day" text NOT NULL,
	"amount" integer NOT NULL,
	"streak_bonus" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "quest_chests_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quest_events" (
	"user_id" varchar NOT NULL,
	"day" text NOT NULL,
	"kind" text NOT NULL,
	"ref" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "quest_events_user_id_day_kind_ref_pk" PRIMARY KEY("user_id","day","kind","ref")
);
--> statement-breakpoint
ALTER TABLE "direct_messages" ADD COLUMN IF NOT EXISTS "card" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "club_chat_reports_once" ON "club_chat_reports" USING btree ("message_id","reporter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_members_club" ON "club_members" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_messages_club" ON "club_messages" USING btree ("club_id","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_messages_user" ON "club_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_requests_user" ON "club_requests" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "clubs_name_lower" ON "clubs" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "moment_comments_moment" ON "moment_comments" USING btree ("moment_id","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "moment_comments_user" ON "moment_comments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "moment_likes_user" ON "moment_likes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "moment_reports_once" ON "moment_reports" USING btree ("kind","target_id","reporter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "moment_reports_reporter" ON "moment_reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "moments_created" ON "moments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "moments_user" ON "moments" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "moments_play" ON "moments" USING btree ("play_id");