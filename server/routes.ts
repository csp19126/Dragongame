import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage.js";
import bcrypt from "bcryptjs";
import { SLOT_SYMBOLS, PAYLINES } from "../shared/schema.js";

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

  // --- AUTH: LOGIN ---
  app.post(["/api/auth/login", "/api/login"], async (req: any, res: any) => {
    try {
      const { username, password } = req.body;
      const user = await (storage as any).getUserByUsername(username);
      if (!user) return res.status(401).json({ message: "User not found" });
      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.status(401).json({ message: "Wrong password" });

      req.session.userId = user.id;
      req.session.save((err: any) => {
        if (err) return res.status(500).json({ message: "Session Save Error" });
        const { password: _, ...safeUser } = user;
        res.json(safeUser);
      });
    } catch (err) {
      res.status(500).json({ message: "Login Error" });
    }
  });

  // --- AUTH: REGISTER ---
  app.post(["/api/auth/register", "/api/register"], async (req: any, res: any) => {
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

      req.session.userId = user.id;
      req.session.save(() => res.status(201).json(user));
    } catch (err) {
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // --- GAME: SPIN (STRENGTHENED & SYNCED) ---
  app.post("/api/game/spin", async (req: any, res: any) => {
    try {
      const userId = req.session.userId; 
      if (!userId) {
         return res.status(401).json({ message: "Unauthorized - No Session Found" });
      }

      const { betAmount } = req.body;
      let user = await (storage as any).getUser(userId);
      if (!user || (user.balance ?? 0) < betAmount) {
        return res.status(400).json({ message: "Insufficient funds or User not found" });
      }

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

      // 1. Update the balance in the DB
      const updatedUser = await (storage as any).creditBalanceAtomic(user.id, winAmount - betAmount);
      
      // 2. Reset the Oracle modifier
      await (storage as any).updateGameState(user.id, "default", { activeModifier: 100 });

      // 3. MANDATORY: Touch the session and save BEFORE sending JSON
      req.session.userId = userId; 
      req.session.save((err: any) => {
        if (err) {
          console.error("SESSION SYNC FAILED:", err);
          return res.status(500).json({ message: "Session sync failed" });
        }
        
        // ONLY respond once the session table is updated
        res.json({ 
          grid, 
          winLines, 
          winAmount, 
          newBalance: updatedUser.balance,
          streak: (gameState as any)?.consecutiveWins || 0 
        });
      });
    } catch (err) {
      console.error("SPIN ERROR:", err);
      res.status(500).json({ message: "Spin Error" });
    }
  });

  // --- GAME: ORACLE ---
  app.post("/api/game/oracle", async (req: any, res: any) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      
      await (storage as any).updateGameState(userId, "default", { activeModifier: 250 });
      req.session.save(() => {
        res.json({ message: "The Dragon grants you 2.5x Luck!", active: true });
      });
    } catch (err) {
      res.status(500).json({ message: "Oracle is silent." });
    }
  });

  // --- GAME: STATE (used by auth hook to check session) ---
  app.get("/api/game/state", async (req: any, res: any) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const user = await (storage as any).getUser(userId);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      res.setHeader("Cache-Control", "no-store");
      res.json({
        balance: user.balance,
        streak: user.streak,
        maxStreak: user.maxStreak,
        totalWins: user.totalWins,
        maxWin: user.maxWin,
        gamesPlayed: user.gamesPlayed,
        gameStates: [],
      });
    } catch (err) {
      res.status(500).json({ message: "State error" });
    }
  });

  // --- USER: PROFILE ---
  app.get("/api/user/profile", async (req: any, res: any) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const user = await (storage as any).getUser(userId);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const { password: _, ...safeUser } = user;
      res.setHeader("Cache-Control", "no-store");
      res.json(safeUser);
    } catch (err) {
      res.status(500).json({ message: "Profile error" });
    }
  });

  // --- AUTH: LOGOUT ---
  app.post("/api/logout", (req: any, res: any) => {
    req.session.destroy((err: any) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      res.clearCookie("dragon_session");
      res.json({ message: "Logged out" });
    });
  });

  // --- GAME: ACHIEVEMENTS ---
  app.get("/api/achievements/:userId", async (req: any, res: any) => {
    try {
      const achievements = await (storage as any).getAchievements(req.params.userId);
      res.json(achievements);
    } catch (err) {
      res.status(500).json({ message: "Achievements error" });
    }
  });

  // --- GAME: LEADERBOARD ---
  app.get("/api/game/leaderboard", async (req: any, res: any) => {
    try {
      const users = await (storage as any).getTopUsers(10);
      res.json(users);
    } catch (err) {
      res.status(500).json({ message: "Leaderboard error" });
    }
  });

  // --- ADMIN: GIFT CARDS ---
  app.post("/api/admin/giftcard", async (req: any, res: any) => {
    try {
      const userId = req.session.userId;
      const user = await (storage as any).getUser(userId);
      
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