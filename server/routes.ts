import { pgTable, text, serial, integer, boolean, timestamp, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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

export const gameStates = pgTable("game_states", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(), 
  slotId: text("slot_id").notNull(), 
  activeModifier: integer("active_modifier").default(100),
  freeSpins: integer("free_spins").default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const giftCards = pgTable("gift_cards", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  denomination: integer("denomination").notNull(),
  isRedeemed: boolean("is_redeemed").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const SLOT_SYMBOLS = [
  { id: "dragon", name: "Imperial Dragon", value: 888, weight: 2 }, 
  { id: "drum", name: "Bronze Drum", value: 100, weight: 8 },
  { id: "lotus", name: "Golden Lotus", value: 50, weight: 15 },
  { id: "lantern", name: "Jade Lantern", value: 20, weight: 25 },
  { id: "coin", name: "Lucky Coin", value: 10, weight: 50 },
];

export const PAYLINES = [[0,0,0],[1,1,1],[2,2,2],[0,1,2],[2,1,0]];
export type User = typeof users.$inferSelect;import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage.js";
import bcrypt from "bcryptjs";
import { SLOT_SYMBOLS, PAYLINES } from "../shared/schema.js";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // Weighted RNG logic
  function getWeightedSymbol(mod: number = 1) {
    const total = SLOT_SYMBOLS.reduce((sum, s) => sum + (s.value > 100 ? s.weight * mod : s.weight), 0);
    let r = Math.random() * total;
    for (const s of SLOT_SYMBOLS) {
      const w = s.value > 100 ? s.weight * mod : s.weight;
      if (r < w) return s;
      r -= w;
    }
    return SLOT_SYMBOLS[SLOT_SYMBOLS.length - 1];
  }

  // --- AUTH ---
  app.post("/api/login", async (req: any, res: any) => {
    const { username, password } = req.body;
    const user = await (storage as any).getUserByUsername(username);
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({message: "Invalid"});
    req.session.userId = user.id;
    req.session.save(() => res.json(user));
  });

  // --- GAME SPIN (FIXED MATH) ---
  app.post("/api/game/spin", async (req: any, res: any) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).send();
    const { betAmount } = req.body;
    const user = await (storage as any).getUser(userId);
    if (!user || user.balance < betAmount) return res.status(400).send();

    const state = await (storage as any).getGameState(userId, "default");
    const luck = (state?.activeModifier ?? 100) / 100;

    const grid = [[],[],[]].map(() => [
      getWeightedSymbol(luck).id, 
      getWeightedSymbol(luck).id, 
      getWeightedSymbol(luck).id
    ]);

    let totalWin = 0;
    const winLines: number[] = [];

    PAYLINES.forEach((line, idx) => {
      const [s1, s2, s3] = [grid[0][line[0]], grid[1][line[1]], grid[2][line[2]]];
      if (s1 === s2 && s2 === s3) {
        const def = SLOT_SYMBOLS.find(s => s.id === s1);
        if (def) {
          // THE BOSS PAYOUT: (Multiplier Value) * (Bet / 10)
          // A 100k bet on a Dragon (888 value) = 8.8 Million Dong win.
          const payout = Math.floor(def.value * (betAmount / 10));
          totalWin += payout;
          winLines.push(idx);
        }
      }
    });

    const updated = await (storage as any).creditBalanceAtomic(userId, totalWin - betAmount);
    
    req.session.save(() => res.json({ 
      grid, 
      winLines, 
      winAmount: totalWin, 
      newBalance: updated.balance,
      isJackpot: totalWin >= betAmount * 10
    }));
  });

  app.get("/api/game/state", async (req: any, res: any) => {
    const user = await (storage as any).getUser(req.session.userId);
    user ? res.json(user) : res.status(401).send();
  });

  return httpServer;
}
