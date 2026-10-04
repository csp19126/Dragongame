-- Voucher codes: a batch name and an admin note (who the code was given to)
ALTER TABLE "gift_cards" ADD COLUMN IF NOT EXISTS "batch" text;
--> statement-breakpoint
ALTER TABLE "gift_cards" ADD COLUMN IF NOT EXISTS "note" text;
