import { pgTable, text, serial, integer, boolean, timestamp, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// --- USERS TABLE ---
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").unique(),
  balance: integer("balance").default(1000).notNull(),
  totalWins: integer("total_wins").default(0).notNull(),
  maxWin: integer("max_win").default(0).notNull(),
  streak: integer("streak").default(0).notNull(),
  maxStreak: integer("max_streak").default(0).notNull(),
  gamesPlayed: integer("games_played").default(0).notNull(),
  isAdmin: boolean("is_admin").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// --- GAME STATE ---
export const gameStates = pgTable("game_states", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(), 
  slotId: text("slot_id").notNull(), 
  activeModifier: integer("active_modifier").default(100), // 100 = 1.0x
  updatedAt: timestamp("updated_at").defaultNow(),
});

// --- ACHIEVEMENTS (The missing piece #1) ---
export const achievements = pgTable("achievements", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  badgeId: text("badge_id").notNull(),
  badgeName: text("badge_name").notNull(),
  description: text("description").notNull(),
  icon: text("icon").notNull(),
  unlockedAt: timestamp("unlocked_at").defaultNow(),
});

// --- DEPOSITS (The missing piece #2) ---
export const deposits = pgTable("deposits", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  amount: integer("amount").notNull(),
  method: text("method").notNull(),
  cardCode: text("card_code"),
  status: text("status").default("completed").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// --- GIFT CARDS (The missing piece #3) ---
export const giftCards = pgTable("gift_cards", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  denomination: integer("denomination").notNull(),
  isRedeemed: boolean("is_redeemed").default(false).notNull(),
  redeemedBy: varchar("redeemed_by"),
  createdAt: timestamp("created_at").defaultNow(),
  redeemedAt: timestamp("redeemed_at"),
});

// --- WITHDRAWALS (The missing piece #4) ---
export const withdrawals = pgTable("withdrawals", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  amount: integer("amount").notNull(),
  status: text("status").default("pending").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// --- SLOT LOGIC (BOSS MULTIPLIERS) ---
export const SLOT_SYMBOLS = [
  { id: "dragon", name: "Imperial Dragon", value: 888, weight: 2 }, 
  { id: "drum", name: "Bronze Drum", value: 100, weight: 8 },
  { id: "lotus", name: "Golden Lotus", value: 50, weight: 15 },
  { id: "lantern", name: "Jade Lantern", value: 20, weight: 25 },
  { id: "coin", name: "Lucky Coin", value: 10, weight: 50 },
];

export const PAYLINES = [
  [0, 0, 0], [1, 1, 1], [2, 2, 2],
  [0, 1, 2], [2, 1, 0],
];

// TYPES FOR STORAGE
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });