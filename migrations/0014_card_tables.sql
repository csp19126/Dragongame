-- Live card tables: coins held for a round in progress
CREATE TABLE IF NOT EXISTS "table_escrows" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"code" text NOT NULL,
	"amount" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "table_escrows_code" ON "table_escrows" USING btree ("code");