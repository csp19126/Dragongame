import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage.js";
import bcrypt from "bcryptjs";
import { SLOT_SYMBOLS, PAYLINES } from "../shared/schema.js";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // --- HELPER: WEIGHTED SYMBOLS (The "Soul" of the math) ---
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

  // --- AUTH: REGISTER (The missing piece) ---
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, password } = req.body;
      const existing = await (storage as any).getUserByUsername(username);
      if (existing) return res.status(400).json({ message: "Username taken" });

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await (storage as any).createUser({
        username,
        password: hashedPassword,
        balance: 50000,
        isAdmin: false
      });

      (req.session as any).userId = user.id;
      req.session.save(() => res.status(201).json(user));
    } catch (err) {
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // --- AUTH: LOGIN ---
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = await (storage as any).getUserByUsername(username);
      if (!user) return res.status(401).json({ message: "User not found" });
      
      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.status(401).json({ message: "Wrong password" });

      (req.session as any).userId = user.id;
      req.session.save(() => {
        const { password: _, ...safeUser } = user;
        res.json(safeUser);
      });
    } catch (err) {
      res.status(500).json({ message: "Login Error" });
    }
  });

  // --- GAME: SPIN ---
  app.post("/api/game/spin", async (req, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { betAmount } = req.body;
      let user = await (storage as any).getUser(userId);
      if (user.balance < betAmount) return res.status(400).json({ message: "Insufficient funds" });

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
        const symbolsOnLine = [grid[0][line[0]], grid[1][line[1]], grid[2][line[2]]];
        if (symbolsOnLine[0] === symbolsOnLine[1] && symbolsOnLine[1] === symbolsOnLine[2]) {
          const symbolDef = (SLOT_SYMBOLS as any[]).find(s => s.id === symbolsOnLine[0]);
          if (symbolDef) {
            winAmount += Math.floor(symbolDef.value * (betAmount / 100) * modifier);
            winLines.push(idx);
          }
        }
      });

      // Deduct bet and add win
      const updatedUser = await (storage as any).creditBalanceAtomic(user.id, winAmount - betAmount);
      
      // Reset Oracle after use
      await (storage as any).updateGameState(user.id, "default", { activeModifier: 100 });

      res.json({ 
        grid, 
        winLines, 
        winAmount, 
        newBalance: updatedUser.balance,
        streak: (gameState as any)?.consecutiveWins || 0 
      });
    } catch (err) {
      res.status(500).json({ message: "Spin Error" });
    }
  });

  // --- GAME: ORACLE ---
  app.post("/api/game/oracle", async (req, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      
      await (storage as any).updateGameState(userId, "default", {
        activeModifier: 250 // 2.5x Luck!
      });

      res.json({ message: "The Dragon grants you 2.5x Luck!", active: true });
    } catch (err) {
      res.status(500).json({ message: "Oracle is silent." });
    }
  });

  // --- GAME: LEADERBOARD (Fixes the Home page list) ---
  app.get("/api/game/leaderboard", async (req, res) => {
    try {
      const users = await (storage as any).getTopUsers(10);
      res.json(users);
    } catch (err) {
      res.status(500).json({ message: "Leaderboard error" });
    }
  });

  // --- ADMIN: GIFT CARDS ---
  app.post("/api/admin/giftcard", async (req, res) => {
    try {
      const userId = (req.session as any).userId;
      const user = await (storage as any).getUser(userId);
      
      // Check column 'is_admin' or 'isAdmin' based on your schema
      if (!user.isAdmin && !user.is_admin) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const { amount } = req.body;
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      res.json({ message: `Code: ${code} created for ${amount}đ`, code });
    } catch (err) {
      res.status(500).json({ message: "Admin Error" });
    }
  });

  return httpServer;
}