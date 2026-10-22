-- Social 2.0: friends, notifications, reactions, replies, the activity feed, friend Lì Xì, profiles and privacy
CREATE TABLE IF NOT EXISTS "feed_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"user_id" varchar NOT NULL,
	"other_id" varchar,
	"game" text,
	"amount" bigint,
	"bet" bigint,
	"level" integer,
	"ref" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "friend_gifts" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_id" varchar NOT NULL,
	"to_id" varchar NOT NULL,
	"day" text NOT NULL,
	"amount" integer NOT NULL,
	"claimed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "friend_requests" (
	"from_id" varchar NOT NULL,
	"to_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "friend_requests_from_id_to_id_pk" PRIMARY KEY("from_id","to_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "friendships" (
	"user_a" varchar NOT NULL,
	"user_b" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "friendships_user_a_user_b_pk" PRIMARY KEY("user_a","user_b")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message_reactions" (
	"scope" varchar(4) NOT NULL,
	"message_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "message_reactions_scope_message_id_user_id_emoji_pk" PRIMARY KEY("scope","message_id","user_id","emoji")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"kind" text NOT NULL,
	"actor_id" varchar,
	"ref" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_social" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"bio" text,
	"fav_game" text,
	"showcase" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dm_from" text DEFAULT 'everyone' NOT NULL,
	"requests_from" text DEFAULT 'everyone' NOT NULL,
	"show_presence" boolean DEFAULT true NOT NULL,
	"show_in_feed" boolean DEFAULT true NOT NULL,
	"xp" bigint DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "reply_to" integer;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD COLUMN IF NOT EXISTS "reply_to" integer;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "feed_items_ref" ON "feed_items" USING btree ("ref");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feed_items_user" ON "feed_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feed_items_other" ON "feed_items" USING btree ("other_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feed_items_created" ON "feed_items" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "friend_gifts_once" ON "friend_gifts" USING btree ("from_id","to_id","day");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "friend_gifts_to" ON "friend_gifts" USING btree ("to_id","day");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "friend_requests_to" ON "friend_requests" USING btree ("to_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "friendships_b" ON "friendships" USING btree ("user_b");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_reactions_user" ON "message_reactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user" ON "notifications" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_ref" ON "notifications" USING btree ("user_id","ref");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_created" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_actor" ON "notifications" USING btree ("actor_id");