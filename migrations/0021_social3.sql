-- Social 3: invites (DM cards), clubs, daily quests, Talk boards, photos in messages, find a match, lounge rooms, richer profiles
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
	"photo_id" integer,
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
CREATE TABLE IF NOT EXISTS "match_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"game" text NOT NULL,
	"stake" integer DEFAULT 0 NOT NULL,
	"note" text,
	"expires_at" timestamp NOT NULL,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"scope" text NOT NULL,
	"ref" text,
	"mime" text NOT NULL,
	"data" "bytea" NOT NULL,
	"bytes" integer NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
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
CREATE TABLE IF NOT EXISTS "talk_replies" (
	"id" serial PRIMARY KEY NOT NULL,
	"thread_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"text" text,
	"photo_id" integer,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "talk_threads" (
	"id" serial PRIMARY KEY NOT NULL,
	"board" text NOT NULL,
	"user_id" varchar NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"photo_id" integer,
	"replies" integer DEFAULT 0 NOT NULL,
	"thumbs" integer DEFAULT 0 NOT NULL,
	"last_at" timestamp DEFAULT now() NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "talk_thumbs" (
	"thread_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	CONSTRAINT "talk_thumbs_thread_id_user_id_pk" PRIMARY KEY("thread_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ugc_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"target_id" integer NOT NULL,
	"reporter_id" varchar NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "room" text DEFAULT 'main' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "photo_id" integer;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD COLUMN IF NOT EXISTS "card" jsonb;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD COLUMN IF NOT EXISTS "photo_id" integer;--> statement-breakpoint
ALTER TABLE "user_social" ADD COLUMN IF NOT EXISTS "country" text;--> statement-breakpoint
ALTER TABLE "user_social" ADD COLUMN IF NOT EXISTS "hide_country" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_social" ADD COLUMN IF NOT EXISTS "fav_games" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "user_social" ADD COLUMN IF NOT EXISTS "languages" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "user_social" ADD COLUMN IF NOT EXISTS "play_style" text;--> statement-breakpoint
ALTER TABLE "user_social" ADD COLUMN IF NOT EXISTS "show_photos" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "club_chat_reports_once" ON "club_chat_reports" USING btree ("message_id","reporter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_members_club" ON "club_members" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_messages_club" ON "club_messages" USING btree ("club_id","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_messages_user" ON "club_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_requests_user" ON "club_requests" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "clubs_name_lower" ON "clubs" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "match_posts_open" ON "match_posts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "match_posts_user" ON "match_posts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_photos_user" ON "message_photos" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "talk_replies_thread" ON "talk_replies" USING btree ("thread_id","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "talk_replies_user" ON "talk_replies" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "talk_threads_board" ON "talk_threads" USING btree ("board","last_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "talk_threads_user" ON "talk_threads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "talk_thumbs_user" ON "talk_thumbs" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ugc_reports_once" ON "ugc_reports" USING btree ("kind","target_id","reporter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ugc_reports_reporter" ON "ugc_reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_messages_room" ON "chat_messages" USING btree ("room","id");