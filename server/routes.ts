import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { SLOT_SYMBOLS, PAYLINES } from "../shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Force every response in this file to be JSON to prevent the "Line 1" error
  app.use("/api", (req, res, next) => {
    res.setHeader('Content-Type', 'application/json');
    next();
  });

  function getWeightedSymbol() {
    const symbols = SLOT_SYMBOLS;
    const totalWeight = symbols.reduce((sum, s) => sum + s.weight, 0);
    let random = Math.random() * totalWeight;
    for (const symbol of symbols) {
      if (random < symbol.weight) return symbol;
      random -= symbol.weight;
    }
    return symbols[symbols.length - 1]; 
  }

  // --- LOGIN ---
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = await storage.getUserByUsername(username);
      
      if (!user) return res.status(401).json({ message: "User not found" });

      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.status(401).json({ message: "Wrong password" });

      (req.session as any).userId = user.id;
      
      req.session.save((err) => {
        if (err) return res.status(500).json({ message: "Session error" });
        const { password: _, ...safeUser } = user;
        return res.status(200).json(safeUser);
      });
    } catch (err) {
      return res.status(500).json({ message: "Login crashed" });
    }
  });

  // --- REGISTER ---
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, password } = req.body;
      const existing = await storage.getUserByUsername(username);
      if (existing) return res.status(400).json({ message: "Username taken" });

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await storage.createUser({ 
        username, 
        password: hashedPassword, 
        firstName: "", lastName: "", 
        email: `${username}@example.com`,
        balance: 50000 
      });

      (req.session as any).userId = user.id;
      req.session.save(() => {
        const { password: _, ...safeUser } = user;
        return res.status(201).json(safeUser);
      });
    } catch (err) {
      return res.status(500).json({ message: "Register crashed" });
    }
  });

  // --- SPIN ---
  app.post("/api/game/spin", async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) return res.status(401).json({ message: "Please login again" });

      const { betAmount } = req.body;
      let user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "User not found" });

      let gameState = await storage.getGameState(user.id, "default");
      if (!gameState) {
        gameState = await storage.updateGameState(user.id, "default", { freeSpins: 0, activeModifier: 100 });
      }

      const isFreeSpin = (gameState?.freeSpins ?? 0) > 0;
      if (!isFreeSpin) {
        const deducted = await storage.deductBalanceAtomic(user.id, betAmount);
        if (!deducted) return res.status(400).json({ message: "Insufficient gold" });
        user = deducted;
      }

      const modifier = (gameState?.activeModifier ?? 100) / 100;
      const grid = [
        [getWeightedSymbol().id, getWeightedSymbol().id, getWeightedSymbol().id],
        [getWeightedSymbol().id, getWeightedSymbol().id, getWeightedSymbol().id],
        [getWeightedSymbol().id, getWeightedSymbol().id, getWeightedSymbol().id],
      ];

      let winAmount = 0;
      const winLines: number[] = [];

      PAYLINES.forEach((line: any, idx: number) => {
        const vals = Array.isArray(line[0]) 
          ? (line as [number, number][]).map(([c, r]) => grid[c][r])
          : [grid[0][line[0]], grid[1][line[1]], grid[2][line[2]]];

        if (vals[0] && vals[0] === vals[1] && vals[1] === vals[2]) {
          const symbol = SLOT_SYMBOLS.find(s => s.id === vals[0]);
          if (symbol) {
            winAmount += Math.floor(symbol.value * (betAmount / 1000) * modifier);
            winLines.push(idx);
          }
        }
      });

      const nextWins = winAmount > 0 ? (gameState?.consecutiveWins ?? 0) + 1 : 0;
      await storage.updateGameState(user.id, "default", { 
        lastReels: grid.flat().join(","),
        activeModifier: 100,
        freeSpins: (gameState?.freeSpins ?? 0) - (isFreeSpin ? 1 : 0),
        consecutiveWins: nextWins
      });

      if (winAmount > 0) user = await storage.creditBalanceAtomic(user.id, winAmount);
      const updatedUser = await storage.updateStreak(user.id, nextWins, user.maxStreak ?? 0, (user.totalWins ?? 0) + (winAmount > 0 ? 1 : 0), Math.max(user.maxWin ?? 0, winAmount));

      return res.json({ grid, winLines, winAmount, newBalance: updatedUser.balance, streak: nextWins });
    } catch (err) {
      return res.status(500).json({ message: "Spin error" });
    }
  });

  // --- ORACLE ---
  app.post("/api/game/oracle", async (req: any, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const result = await storage.consultOracle(userId);
    return res.json(result);
  });

  // --- PROFILE ---
  app.get("/api/user/profile", async (req: any, res) => {
    const userId = (req.session as any).userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const user = await storage.getUser(userId);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    const { password: _, ...safeUser } = user;
    return res.json(safeUser);
  });

  return httpServer;
}