import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import { SLOT_SYMBOLS, PAYLINES } from "../shared/schema";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

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

  app.post("/api/login", async (req: any, res: any) => {
    const { username, password } = req.body;
    const user = await storage.getUserByUsername(username);
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({message: "Invalid credentials"});
    req.session.userId = user.id;
    req.session.save(() => res.json(user));
  });

  app.post("/api/game/spin", async (req: any, res: any) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).send();
    
    const { betAmount } = req.body;
    const user = await storage.getUser(userId);
    if (!user) return res.status(401).send();

    const state = await storage.getGameState(userId, "main");
    const isFreeSpin = (state?.freeSpins ?? 0) > 0;
    
    if (!isFreeSpin && user.balance < betAmount) return res.status(400).json({message: "Insufficient balance"});

    const luck = (state?.activeModifier ?? 100) / 100;
    const grid = [[],[],[]].map(() => [getWeightedSymbol(luck).id, getWeightedSymbol(luck).id, getWeightedSymbol(luck).id]);

    let winAmount = 0;
    const winLines: number[] = [];
    PAYLINES.forEach((line, idx) => {
      const [s1, s2, s3] = [grid[0][line[0]], grid[1][line[1]], grid[2][line[2]]];
      if (s1 === s2 && s2 === s3) {
        const def = SLOT_SYMBOLS.find(s => s.id === s1);
        if (def) {
          winAmount += Math.floor(def.value * (betAmount / 10));
          winLines.push(idx);
        }
      }
    });

    const isRepeater = Math.random() < 0.1;
    const freeSpinsAwarded = winAmount > betAmount * 5 ? 3 : 0;

    await storage.updateGameState(userId, "main", { 
      freeSpins: (state?.freeSpins ?? 0) + freeSpinsAwarded - (isFreeSpin ? 1 : 0),
      activeModifier: 100 
    });

    const updated = await storage.creditBalanceAtomic(userId, winAmount - (isFreeSpin ? 0 : betAmount));

    req.session.save(() => res.json({ 
      grid, winLines, winAmount, newBalance: updated.balance, 
      totalFreeSpins: (state?.freeSpins ?? 0) + freeSpinsAwarded - (isFreeSpin ? 1 : 0),
      isRepeater, isNearMiss: winAmount === 0 && Math.random() < 0.3
    }));
  });

  app.post("/api/game/oracle", async (req: any, res: any) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).send();
    await storage.updateGameState(userId, "main", { activeModifier: 300 });
    res.json({ message: "🐉 THE DRAGON BLESSES YOUR LUCK!" });
  });

  return httpServer;
}