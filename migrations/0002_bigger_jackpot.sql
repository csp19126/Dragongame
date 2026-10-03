-- Hũ Rồng now pays a share that scales with the bet (the 1M bet takes the whole pot), so the
-- floor rises from 1,000,000 to 100,000,000. Lift the live pot to the new floor.
UPDATE "jackpot" SET "amount" = 100000000 WHERE "id" = 1 AND "amount" < 100000000;
--> statement-breakpoint
INSERT INTO "jackpot" ("id", "amount") VALUES (1, 100000000) ON CONFLICT ("id") DO NOTHING;
