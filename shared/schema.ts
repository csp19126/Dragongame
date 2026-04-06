import { pgTable, text, serial, integer, boolean, timestamp, varchar, json } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";
export * from "./models/chat";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  balance: integer("balance").default(1000).notNull(),
  tokens: integer("tokens").default(0).notNull(),
  totalWins: integer("total_wins").default(0).notNull(),
  maxWin: integer("max_win").default(0).notNull(),
  streak: integer("streak").default(0).notNull(),
  maxStreak: integer("max_streak").default(0).notNull(),
  gamesPlayed: integer("games_played").default(0).notNull(),
  isAdmin: boolean("is_admin").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, balance: true, tokens: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const gameStates = pgTable("game_states", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(), 
  slotId: text("slot_id").notNull(), 
  // 1. We store the 3 symbols as a string (e.g., "Dragon,Coin,Lotus")
  lastReels: text("last_reels"), 
  // 2. We store the Oracle's luck multiplier here
  activeModifier: integer("active_modifier").default(100), // 100 = 1.0x (using integers for safety)
  lastSpinResult: text("last_spin_result"), 
  freeSpins: integer("free_spins").default(0),
  consecutiveWins: integer("consecutive_wins").default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertGameStateSchema = createInsertSchema(gameStates).omit({ id: true, updatedAt: true });
export type InsertGameState = z.infer<typeof insertGameStateSchema>;
export type GameState = typeof gameStates.$inferSelect;

export const achievements = pgTable("achievements", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  badgeId: text("badge_id").notNull(),
  badgeName: text("badge_name").notNull(),
  description: text("description").notNull(),
  icon: text("icon").notNull(),
  unlockedAt: timestamp("unlocked_at").defaultNow(),
});

export type Achievement = typeof achievements.$inferSelect;

export const leaderboard = pgTable("leaderboard", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  username: text("username").notNull(),
  balance: integer("balance").notNull(),
  totalWins: integer("total_wins").notNull(),
  maxWin: integer("max_win").notNull(),
  maxStreak: integer("max_streak").notNull(),
  rank: integer("rank").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type LeaderboardEntry = typeof leaderboard.$inferSelect;

export const deposits = pgTable("deposits", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  amount: integer("amount").notNull(),
  method: text("method").notNull(),
  cardCode: text("card_code"),
  status: text("status").default("completed").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDepositSchema = createInsertSchema(deposits).omit({ id: true, createdAt: true });
export type InsertDeposit = z.infer<typeof insertDepositSchema>;
export type Deposit = typeof deposits.$inferSelect;

export const giftCards = pgTable("gift_cards", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  denomination: integer("denomination").notNull(),
  isRedeemed: boolean("is_redeemed").default(false).notNull(),
  redeemedBy: varchar("redeemed_by"),
  createdAt: timestamp("created_at").defaultNow(),
  redeemedAt: timestamp("redeemed_at"),
});

export type GiftCard = typeof giftCards.$inferSelect;

export const withdrawals = pgTable("withdrawals", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  amount: integer("amount").notNull(),
  status: text("status").default("pending").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertWithdrawalSchema = createInsertSchema(withdrawals).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWithdrawal = z.infer<typeof insertWithdrawalSchema>;
export type Withdrawal = typeof withdrawals.$inferSelect;

export const sessions = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
});

// Define the symbols and their "Weights" (Higher weight = appears more often)
export const SLOT_SYMBOLS = [
  { id: "dragon", name: "Golden Dragon", value: 500, weight: 2, image: "/assets/dragon.png" },
  { id: "drum", name: "Bronze Drum", value: 100, weight: 8, image: "/assets/drum.png" },
  { id: "lotus", name: "Golden Lotus", value: 50, weight: 15, image: "/assets/lotus.png" },
  { id: "lantern", name: "Jade Lantern", value: 20, weight: 25, image: "/assets/lantern.png" },
  { id: "coin", name: "Lucky Coin", value: 5, weight: 50, image: "/assets/coin.png" },
];

// Define the ways to win (House Advantage built-in)
export const PAYLINES = [
  [0, 0, 0], // Straight line
  [0, 1, 0], // Small V
  [1, 0, 1], // Inverted V
];
