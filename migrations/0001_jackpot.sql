-- Hũ Rồng progressive jackpot: a single row (id = 1), seeded with the starting pot.
CREATE TABLE IF NOT EXISTS "jackpot" (
	"id" integer PRIMARY KEY NOT NULL,
	"amount" bigint NOT NULL,
	"last_winner" text,
	"last_amount" bigint,
	"last_won_at" timestamp
);
--> statement-breakpoint
INSERT INTO "jackpot" ("id", "amount") VALUES (1, 1000000) ON CONFLICT ("id") DO NOTHING;
