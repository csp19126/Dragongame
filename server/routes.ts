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
  
  // --- ENGINE: WEIGHTED RANDOMNESS ---
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

  // --- API: CONSULT THE ORACLE ---
  app.post("/api/game/oracle", async (req: any, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    try {
      const result = await storage.consultOracle(userId);
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Oracle is silent..." });
    }
  });

  // --- API: THE WEIGHTED SPIN ---
  app.post("/api/game/spin", async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { betAmount, slotId } = req.body;
      let user = await storage.getUser(userId) || await storage.getUserByUsername(userId);
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      let gameState = await storage.getGameState(user.id, slotId || "default");
      if (!gameState) {
        gameState = await storage.updateGameState(user.id, slotId || "default", { freeSpins: 0, activeModifier: 100 });
      }

      const isFreeSpin = (gameState?.freeSpins ?? 0) > 0;
      if (!isFreeSpin) {
        const deducted = await storage.deductBalanceAtomic(user.id, betAmount);
        if (!deducted) return res.status(400).json({ message: "Insufficient balance" });
        user = deducted;
      }

      const modifier = (gameState?.activeModifier ?? 100) / 100;

      // 3x3 Weighted Grid
      const grid: string[][] = [
        [getWeightedSymbol().id, getWeightedSymbol().id, getWeightedSymbol().id],
        [getWeightedSymbol().id, getWeightedSymbol().id, getWeightedSymbol().id],
        [getWeightedSymbol().id, getWeightedSymbol().id, getWeightedSymbol().id],
      ];

      let winAmount = 0;
      const winLines: number[] = [];

      PAYLINES.forEach((line: any, idx: number) => {
        let vals: (string | null)[] = [];
        if (Array.isArray(line[0])) {
          vals = (line as [number, number][]).map(([col, row]) => (grid[col] && grid[col][row]) ? grid[col][row] : null);
        } else {
          vals = [grid[0][line[0]], grid[1][line[1]], grid[2][line[2]]];
        }

        if (vals[0] && vals[0] === vals[1] && vals[1] === vals[2]) {
          const symbol = SLOT_SYMBOLS.find(s => s.id === vals[0]);
          if (symbol) {
            const baseWin = symbol.value * (betAmount / 1000);
            winAmount += Math.floor(baseWin * modifier);
            winLines.push(idx);
          }
        }
      });

      const nextWins = winAmount > 0 ? (gameState?.consecutiveWins ?? 0) + 1 : 0;

      await storage.updateGameState(user.id, slotId || "default", { 
        lastReels: grid.flat().join(","),
        activeModifier: 100,
        freeSpins: (gameState?.freeSpins ?? 0) - (isFreeSpin ? 1 : 0),
        consecutiveWins: nextWins
      });

      if (winAmount > 0) {
        user = await storage.creditBalanceAtomic(user.id, winAmount);
      }

      const updatedUser = await storage.updateStreak(
        user.id, nextWins, user.maxStreak ?? 0, (user.totalWins ?? 0) + (winAmount > 0 ? 1 : 0), Math.max(user.maxWin ?? 0, winAmount)
      );

      res.json({
        grid, winLines, winAmount,
        newBalance: updatedUser.balance,
        oracleApplied: modifier !== 1.0,
        streak: nextWins,
        gamesPlayed: updatedUser.gamesPlayed
      });
    } catch (err) {
      res.status(500).json({ message: "Spin failed" });
    }
  });

  // --- API: LEADERBOARD ---
  app.get("/api/game/leaderboard", async (req, res) => {
    const leaderboardUsers = await storage.getLeaderboard();
    res.json(leaderboardUsers.map((u: any, idx: number) => ({ 
      rank: idx + 1, 
      username: u.username, 
      balance: u.balance,
      totalWins: u.totalWins ?? 0,
      maxWin: u.maxWin ?? 0
    })));
  });

  // --- API: AUTH (REGISTER) ---
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, password } = req.body;
      const existing = await storage.getUserByUsername(username);
      if (existing) return res.status(400).json({ message: "Username exists" });

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await storage.createUser({ 
        username, 
        password: hashedPassword, 
        firstName: "", 
        lastName: "", 
        email: `${username}@example.com`,
        balance: 50000 
      });

      (req.session as any).userId = user.id;
      const { password: _, ...safeUser } = user;
      res.status(201).json(safeUser);
    } catch (err) {
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // --- API: AUTH (LOGIN) ---
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = await storage.getUserByUsername(username);
      
      if (!user) return res.status(401).json({ message: "Invalid credentials" });

      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.status(401).json({ message: "Invalid credentials" });

      (req.session as any).userId = user.id;
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (err) {
      res.status(500).json({ message: "Login failed" });
    }
  });

  // --- API: PROFILE ---
  app.get("/api/user/profile", async (req: any, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).send("Unauthorized");
    const user = await storage.getUser(userId);
    if (!user) return res.status(401).send("Unauthorized");
    const { password: _, ...safeUser } = user;
    res.json(safeUser);
  });

  return httpServer;
}