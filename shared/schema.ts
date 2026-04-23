import { pgTable, text, serial, integer, boolean, timestamp, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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

export const gameStates = pgTable("game_states", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(), 
  slotId: text("slot_id").notNull(), 
  activeModifier: integer("active_modifier").default(100),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// THE SOUL OF THE MATH: Multipliers set for High-Rollers
export const SLOT_SYMBOLS = [
  { id: "dragon", name: "Imperial Dragon", value: 888, weight: 2 }, // 888x!
  { id: "drum", name: "Bronze Drum", value: 100, weight: 8 },
  { id: "lotus", name: "Golden Lotus", value: 50, weight: 15 },
  { id: "lantern", name: "Jade Lantern", value: 20, weight: 25 },
  { id: "coin", name: "Lucky Coin", value: 10, weight: 50 },
];

export const PAYLINES = [
  [0, 0, 0], // Top
  [1, 1, 1], // Middle
  [2, 2, 2], // Bottom
  [0, 1, 2], // Diagonal Down
  [2, 1, 0], // Diagonal Up
];

export type User = typeof users.$inferSelect;
export type GameState = typeof gameStates.$inferSelect;