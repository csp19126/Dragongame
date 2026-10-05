-- GIỮ CUỘN (HOLD): the grid and bet a hold was offered at
ALTER TABLE "game_states" ADD COLUMN IF NOT EXISTS "hold_grid" jsonb;--> statement-breakpoint
ALTER TABLE "game_states" ADD COLUMN IF NOT EXISTS "hold_bet" integer;