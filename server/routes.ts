import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import bcrypt from "bcryptjs";
// FIXED PATH: Moving from server to shared is only one folder up (..)
import { SLOT_SYMBOLS, PAYLINES } from "../shared/schema.js"; // Added .js for ESM compatibility

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  function getWeightedSymbol() {
    const symbols = SLOT_SYMBOLS as any[];
    const totalWeight = symbols.reduce((sum, s) => sum + (s.weight || 10), 0);
    let random = Math.random() * totalWeight;
    for (const symbol of symbols) {
      if (random < symbol.weight) return symbol;
      random -= symbol.weight;
    }
    return symbols[symbols.length - 1]; 
  }

  // --- REGISTER ---
  app.post("/api/auth/register", async (req: any, res: any) => {
    try {
      const { username, password } = req.body;
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await (storage as any).createUser({ 
        username, 
        password: hashedPassword, 
        firstName: "", 
        lastName: "", 
        email: `${username}@vns888.com`,
        balance: 50000 
      });

      (req.session as any).userId = user.id;
      // CRITICAL: Save session before responding to avoid JSON.parse error
      req.session.save(() => {
        const { password: _, ...safeUser } = user;
        res.status(201).json(safeUser);
      });
    } catch (err) {
      res.status(500).json({ message: "Reg Error" });
    }
  });

  // --- LOGIN ---
  app.post("/api/auth/login", async (req: any, res: any) => {
    try {
      const { username, password } = req.body;
      const user = await (storage as any).getUserByUsername(username);
      if (!user) return res.status(401).json({ message: "Invalid" });
      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.status(401).json({ message: "Invalid" });

      (req.session as any).userId = user.id;
      // CRITICAL: Save session before responding to avoid JSON.parse error
      req.session.save(() => {
        const { password: _, ...safeUser } = user;
        res.json(safeUser);
      });
    } catch (err) {
      res.status(500).json({ message: "Login Error" });
    }
  });

  // --- SPIN ---
  app.post("/api/game/spin", async (req: any, res: any) => {
    try {
      const userId = (req.session as any).userId;
      const { betAmount } = req.body;
      let user = await (storage as any).getUser(userId);
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      let gameState = await (storage as any).getGameState(user.id, "default");
      const modifier = ((gameState as any)?.activeModifier ?? 100) / 100;

      const grid = [
        [getWeightedSymbol().id, getWeightedSymbol().id, getWeightedSymbol().id],
        [getWeightedSymbol().id, getWeightedSymbol().id, getWeightedSymbol().id],
        [getWeightedSymbol().id, getWeightedSymbol().id, getWeightedSymbol().id],
      ];

      let winAmount = 0;
      const winLines: number[] = [];

      (PAYLINES as any[]).forEach((line, idx) => {
        const vals = Array.isArray(line[0]) 
          ? line.map(([c, r]: [number, number]) => grid[c][r])
          : [grid[0][line[0]], grid[1][line[1]], grid[2][line[2]]];

        if (vals[0] && vals[0] === vals[1] && vals[1] === vals[2]) {
          const symbol = (SLOT_SYMBOLS as any[]).find(s => s.id === vals[0]);
          if (symbol) {
            winAmount += Math.floor(symbol.value * (betAmount / 1000) * modifier);
            winLines.push(idx);
          }
        }
      });

      if (winAmount > 0) user = await (storage as any).creditBalanceAtomic(user.id, winAmount);
      const nextWins = winAmount > 0 ? ((gameState as any)?.consecutiveWins ?? 0) + 1 : 0;
      
      await (storage as any).updateGameState(user.id, "default", { 
        lastReels: grid.flat().join(","),
        activeModifier: 100,
        consecutiveWins: nextWins
      });

      const updatedUser = await (storage as any).updateStreak(user.id, nextWins, user.maxStreak ?? 0, (user.totalWins ?? 0) + (winAmount > 0 ? 1 : 0), Math.max(user.maxWin ?? 0, winAmount));

      res.json({ grid, winLines, winAmount, newBalance: updatedUser.balance, streak: nextWins });
    } catch (err) {
      res.status(500).json({ message: "Spin error" });
    }
  });

  // --- ORACLE ---
  app.post("/api/game/oracle", async (req: any, res: any) => {
    try {
      const userId = (req.session as any)?.userId;
      const result = await (storage as any).consultOracle(userId);
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Oracle Error" });
    }
  });

  return httpServer;
}