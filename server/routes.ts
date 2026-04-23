import type { Express } from "express";
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
