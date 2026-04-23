import { pgTable, text, serial, integer, boolean, timestamp, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// --- USERS ---
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
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
  activeModifier: integer("active_modifier").default(100),
  freeSpins: integer("free_spins").default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// --- ACHIEVEMENTS ---
export const achievements = pgTable("achievements", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  badgeId: text("badge_id").notNull(),
  badgeName: text("badge_name").notNull(),
  description: text("description").notNull(),
  icon: text("icon").notNull(),
  unlockedAt: timestamp("unlocked_at").defaultNow(),
});

// --- DEPOSITS ---
export const deposits = pgTable("deposits", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  amount: integer("amount").notNull(),
  method: text("method").notNull(),
  status: text("status").default("completed").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// --- GIFT CARDS ---
export const giftCards = pgTable("gift_cards", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  denomination: integer("denomination").notNull(),
  isRedeemed: boolean("is_redeemed").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// --- WITHDRAWALS ---
export const withdrawals = pgTable("withdrawals", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  amount: integer("amount").notNull(),
  status: text("status").default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// --- DATA FOR THE GAME ---
export const SLOT_SYMBOLS = [
  { id: "dragon", name: "Imperial Dragon", value: 888, weight: 2 }, 
  { id: "drum", name: "Bronze Drum", value: 100, weight: 8 },
  { id: "lotus", name: "Golden Lotus", value: 50, weight: 15 },
  { id: "lantern", name: "Jade Lantern", value: 20, weight: 25 },
  { id: "coin", name: "Lucky Coin", value: 10, weight: 50 },
];

export const PAYLINES = [[0,0,0],[1,1,1],[2,2,2],[0,1,2],[2,1,0]];

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export type User = typeof users.$inferSelect;