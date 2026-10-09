-- Lô Tô: rounds and tickets
CREATE TABLE IF NOT EXISTS "loto_rounds" (
	"round" integer PRIMARY KEY NOT NULL,
	"draws" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "loto_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"round" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"grid" jsonb NOT NULL,
	"price" integer NOT NULL,
	"kinh_at" integer,
	"payout" bigint NOT NULL,
	"settled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loto_tickets_round" ON "loto_tickets" USING btree ("round","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loto_tickets_unsettled" ON "loto_tickets" USING btree ("settled","round");