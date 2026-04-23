import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage.js";
import bcrypt from "bcryptjs";
import { SLOT_SYMBOLS, PAYLINES } from "../shared/schema.js";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // 1. RNG Engine
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

  // 2. Auth: Login
  app.post("/api/login", async (req: any, res: any) => {
    try {
      const { username, password } = req.body;
      const user = await (storage as any).getUserByUsername(username);
      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      req.session.userId = user.id;
      req.session.save(() => res.json(user));
    } catch (err) {
      res.status(500).json({ message: "Login Error" });
    }
  });

  // 3. Game: Spin (Multipliers + Bonuses)
  app.post("/api/game/spin", async (req: any, res: any) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { betAmount } = req.body;
      const user = await (storage as any).getUser(userId);
      const state = await (storage as any).getGameState(userId, "main");
      
      const isFreeSpin = (state?.freeSpins ?? 0) > 0;
      if (!isFreeSpin && (!user || user.balance < betAmount)) {
        return res.status(400).json({ message: "Insufficient balance" });
      }

      const luck = (state?.activeModifier ?? 100) / 100;
      const grid = [[],[],[]].map(() => [
        getWeightedSymbol(luck).id, 
        getWeightedSymbol(luck).id, 
        getWeightedSymbol(luck).id
      ]);

      let winAmount = 0;
      const winLines: number[] = [];

      PAYLINES.forEach((line, idx) => {
        const [s1, s2, s3] = [grid[0][line[0]], grid[1][line[1]], grid[2][line[2]]];
        if (s1 === s2 && s2 === s3) {
          const def = SLOT_SYMBOLS.find(s => s.id === s1);
          if (def) {
            // BOSS MATH: Value * (Bet / 10)
            const payout = Math.floor(def.value * (betAmount / 10));
            winAmount += payout;
            winLines.push(idx);
          }
        }
      });

      // Bonus Logic
      const freeSpinsAwarded = winAmount > betAmount * 5 ? 3 : 0;
      await (storage as any).updateGameState(userId, "main", { 
        freeSpins: (state?.freeSpins ?? 0) + freeSpinsAwarded - (isFreeSpin ? 1 : 0),
        activeModifier: 100 
      });

      const cost = isFreeSpin ? 0 : betAmount;
      const updated = await (storage as any).creditBalanceAtomic(userId, winAmount - cost);

      req.session.save(() => {
        res.json({ 
          grid, 
          winLines, 
          winAmount, 
          newBalance: updated.balance,
          freeSpinsAwarded,
          totalFreeSpins: (state?.freeSpins ?? 0) + freeSpinsAwarded - (isFreeSpin ? 1 : 0),
          isRepeater: Math.random() > 0.9 
        });
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Spin Error" });
    }
  });

  // 4. Game: Oracle
  app.post("/api/game/oracle", async (req: any, res: any) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).send();
      await (storage as any).updateGameState(userId, "main", { activeModifier: 300 });
      res.json({ message: "🐉 THE DRAGON BLESSES YOUR LUCK (3X WEIGHT!)" });
    } catch (err) {
      res.status(500).send();
    }
  });

  // 5. Game: State
  app.get("/api/game/state", async (req: any, res: any) => {
    try {
      const user = await (storage as any).getUser(req.session.userId);
      if (!user) return res.status(401).send();
      res.json(user);
    } catch (err) {
      res.status(500).send();
    }
  });

  return httpServer;
}