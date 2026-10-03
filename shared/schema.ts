import { pgTable, text, serial, integer, bigint, boolean, timestamp, varchar, json, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  // bigint: a few max-bet dragon lines can push a balance past the 2.1B int4 limit
  balance: bigint("balance", { mode: "number" }).default(50000).notNull(),
  tokens: integer("tokens").default(0).notNull(),
  totalWins: integer("total_wins").default(0).notNull(),
  maxWin: bigint("max_win", { mode: "number" }).default(0).notNull(),
  streak: integer("streak").default(0).notNull(),
  maxStreak: integer("max_streak").default(0).notNull(),
  gamesPlayed: integer("games_played").default(0).notNull(),
  isAdmin: boolean("is_admin").default(false).notNull(),
  lastDailyBonusAt: timestamp("last_daily_bonus_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const gameStates = pgTable("game_states", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  slotId: text("slot_id").notNull(),
  activeModifier: integer("active_modifier").default(100),
  freeSpins: integer("free_spins").default(0),
  // Free spins are played at the bet that won them, so they can't be cashed in at a bigger bet
  freeSpinBet: integer("free_spin_bet").default(0),
  lastOracleAt: timestamp("last_oracle_at"),
  consecutiveWins: integer("consecutive_wins").default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const achievements = pgTable("achievements", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  badgeId: text("badge_id").notNull(),
  badgeName: text("badge_name").notNull(),
  description: text("description").notNull(),
  icon: text("icon").notNull(),
  unlockedAt: timestamp("unlocked_at").defaultNow(),
});

// Coin credits: promo codes and daily bonuses. Coins are play money only.
export const deposits = pgTable("deposits", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  amount: integer("amount").notNull(),
  method: text("method").notNull(),
  cardCode: text("card_code"),
  status: text("status").default("completed").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Promo codes (table name kept so existing data survives `db:push`)
export const giftCards = pgTable("gift_cards", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  denomination: integer("denomination").notNull(),
  isRedeemed: boolean("is_redeemed").default(false).notNull(),
  redeemedBy: varchar("redeemed_by"),
  createdAt: timestamp("created_at").defaultNow(),
  redeemedAt: timestamp("redeemed_at"),
});

// Legacy table, no longer used by the app. Kept so `db:push` doesn't drop existing rows.
export const withdrawals = pgTable("withdrawals", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  amount: integer("amount").notNull(),
  status: text("status").default("pending").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Express session store (connect-pg-simple). Declared here so `db:push` never tries to drop it.
export const sessions = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
}, (t) => [index("IDX_session_expire").on(t.expire)]);

export type User = typeof users.$inferSelect;
export type PublicUser = Omit<User, "password">;
export type InsertUser = typeof users.$inferInsert;
export type GameState = typeof gameStates.$inferSelect;
export type InsertGameState = typeof gameStates.$inferInsert;
export type GiftCard = typeof giftCards.$inferSelect;
export type Withdrawal = typeof withdrawals.$inferSelect;
export type Deposit = typeof deposits.$inferSelect;
export type Achievement = typeof achievements.$inferSelect;

export const credentialsSchema = z.object({
  username: z.string().trim().min(3, "Username must be at least 3 characters").max(24, "Username is too long")
    .regex(/^[\p{L}\p{N}_ .-]+$/u, "Username has invalid characters"),
  password: z.string().min(6, "Password must be at least 6 characters").max(128),
});
export type Credentials = z.infer<typeof credentialsSchema>;

// ---- Game definition (shared by server engine and client display) ----

export interface SlotSymbol {
  id: string;
  name: string;
  /** Payout for three on a line, as a multiple of the TOTAL bet */
  pays: number;
  weight: number;
}

export const SLOT_SYMBOLS: SlotSymbol[] = [
  { id: "dragon", name: "Imperial Dragon", pays: 88.8, weight: 2 },
  { id: "drum", name: "Bronze Drum", pays: 10, weight: 8 },
  { id: "lotus", name: "Golden Lotus", pays: 6, weight: 15 },
  { id: "lantern", name: "Jade Lantern", pays: 2.5, weight: 25 },
  { id: "coin", name: "Lucky Coin", pays: 1, weight: 50 },
];

/** Each payline is [row in col 0, row in col 1, row in col 2] */
export const PAYLINES = [[0, 0, 0], [1, 1, 1], [2, 2, 2], [0, 1, 2], [2, 1, 0]];

export const BET_OPTIONS = [1000, 5000, 10000, 50000, 100000, 500000, 1000000];

export const FREE_SPINS_AWARD = 3;
/** A spin that pays at least this multiple of the bet awards free spins */
export const FREE_SPINS_TRIGGER_MULTIPLE = 10;
/** Oracle blessing multiplies the winnings of the player's next spin */
export const ORACLE_WIN_MULTIPLIER = 2;
export const ORACLE_COOLDOWN_MS = 60 * 60 * 1000;

export const DAILY_BONUS_AMOUNT = 50000;
export const DAILY_BONUS_COOLDOWN_MS = 20 * 60 * 60 * 1000;
export const STARTING_BALANCE = 50000;
