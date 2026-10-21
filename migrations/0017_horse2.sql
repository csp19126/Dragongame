-- Đua Ngựa: more ways to bet (win / top 2 / top 3 / forecast), prices in hundredths
ALTER TABLE "horse_bets" ADD COLUMN IF NOT EXISTS "bet_type" varchar(10) DEFAULT 'win' NOT NULL;--> statement-breakpoint
ALTER TABLE "horse_bets" ADD COLUMN IF NOT EXISTS "horse2" integer;--> statement-breakpoint
ALTER TABLE "horse_bets" ADD COLUMN IF NOT EXISTS "odds100" integer;--> statement-breakpoint
-- Existing bets keep exactly the price they were placed at (tenths -> hundredths)
UPDATE "horse_bets" SET "odds100" = "odds" * 10 WHERE "odds100" IS NULL;--> statement-breakpoint
ALTER TABLE "horse_bets" ALTER COLUMN "odds100" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "horse_rounds" ADD COLUMN IF NOT EXISTS "odds100" jsonb;--> statement-breakpoint
UPDATE "horse_rounds" SET "odds100" = (
	SELECT jsonb_agg((x.v)::int * 10 ORDER BY x.i) FROM jsonb_array_elements_text("horse_rounds"."odds") WITH ORDINALITY AS x(v, i)
) WHERE "odds100" IS NULL;--> statement-breakpoint
ALTER TABLE "horse_rounds" ALTER COLUMN "odds100" SET NOT NULL;
