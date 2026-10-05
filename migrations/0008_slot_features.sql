-- 5-reel slot: free-spin pick and multiplier, Xóc Đĩa double-up, oracle fortune stick
ALTER TABLE "game_states" ADD COLUMN IF NOT EXISTS "oracle_stick" integer;--> statement-breakpoint
ALTER TABLE "game_states" ADD COLUMN IF NOT EXISTS "free_spin_units" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_states" ADD COLUMN IF NOT EXISTS "free_spin_mult" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_states" ADD COLUMN IF NOT EXISTS "gamble_amount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_states" ADD COLUMN IF NOT EXISTS "gamble_rounds" integer DEFAULT 0 NOT NULL;