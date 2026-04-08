import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage.js";
import bcrypt from "bcryptjs";
import { SLOT_SYMBOLS, PAYLINES } from "../shared/schema.js";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // --- RNG ENGINE: WEIGHTED SYMBOLS ---
  function getWeightedSymbol(modifier: number = 1) {
    const symbols = SLOT_SYMBOLS as any[];
    // If modifier > 1, we artificially boost the weight of higher value symbols
    const totalWeight = symbols.reduce((sum, s) => {
      const weightBoost = (s.value > 100 && modifier > 1) ? s.weight * modifier : s.weight;
      return sum + weightBoost;
    }, 0);

    let random = Math.random() * totalWeight;
    for (const symbol of symbols) {
      const currentWeight = (symbol.value > 100 && modifier > 1) ? symbol.weight * modifier : symbol.weight;
      if (random < currentWeight) return symbol;
      random -= currentWeight;
    }
    return symbols[symbols.length - 1];
  }

  // --- AUTH: LOGIN & SESSION ---
  app.post(["/api/auth/login", "/api/login"], async (req: any, res: any) => {
    try {
      const { username, password } = req.body;
      const user = await (storage as any).getUserByUsername(username);
      if (!user) return res.status(401).json({ message: "User not found" });
      
      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.status(401).json({ message: "Wrong password" });

      req.session.userId = user.id;
      req.session.save(() => {
        const { password: _, ...safeUser } = user;
        res.json(safeUser);
      });
    } catch (err) {
      res.status(500).json({ message: "Login Error" });
    }
  });

  // --- GAME: SPIN (The Multiplier Engine) ---
  app.post("/api/game/spin", async (req: any, res: any) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { betAmount } = req.body;
      const user = await (storage as any).getUser(userId);

      if (!user || user.balance < betAmount) {
        return res.status(400).json({ message: "Insufficient balance" });
      }

      // Fetch Oracle state (Luck Modifier)
      const gameState = await (storage as any).getGameState(userId, "default");
      const luckMod = (gameState?.activeModifier ?? 100) / 100;

      // Generate 3x3 Grid
      const grid = [
        [getWeightedSymbol(luckMod).id, getWeightedSymbol(luckMod).id, getWeightedSymbol(luckMod).id],
        [getWeightedSymbol(luckMod).id, getWeightedSymbol(luckMod).id, getWeightedSymbol(luckMod).id],
        [getWeightedSymbol(luckMod).id, getWeightedSymbol(luckMod).id, getWeightedSymbol(luckMod).id],
      ];

      let winAmount = 0;
      const winLines: number[] = [];

      // Calculate Wins based on Bet Multipliers
      (PAYLINES as any[]).forEach((line, idx) => {
        const s1 = grid[0][line[0]];
        const s2 = grid[1][line[1]];
        const s3 = grid[2][line[2]];

        if (s1 === s2 && s2 === s3) {
          const symbolDef = (SLOT_SYMBOLS as any[]).find(s => s.id === s1);
          if (symbolDef) {
            // MATH: (Base Value / 10) * (Bet / 100)
            // Example: 1M bet on Dragon (Value 5000) = 50M Win!
            const lineMultiplier = symbolDef.value / 10;
            // The payout is: (Symbol Base Value / 10) * Total Bet
// Example: Dragon (5000) with 1M bet = (500) * 1,000,000 = 50,000,000đ
const lineWin = Math.floor((symbolDef.value / 10) * betAmount);
            winAmount += lineWin;
            winLines.push(idx);
          }
        }
      });

      // Update Database Atomics
      const updatedUser = await (storage as any).creditBalanceAtomic(user.id, winAmount - betAmount);
      
      // Consume Oracle luck
      if (luckMod > 1) {
        await (storage as any).updateGameState(userId, "default", { activeModifier: 100 });
      }

      // Sync Session & Respond
      req.session.save(() => {
        res.json({
          grid,
          winLines,
          winAmount,
          newBalance: updatedUser.balance,
          isJackpot: winAmount >= betAmount * 50,
          streak: (gameState?.consecutiveWins ?? 0) + (winAmount > 0 ? 1 : -gameState?.consecutiveWins)
        });
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Server Error" });
    }
  });

  // --- GAME: ORACLE (LUCK INJECTION) ---
  app.post("/api/game/oracle", async (req: any, res: any) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const roll = Math.random();
      let modifier = 100;
      let message = "The spirits are indifferent.";
      let type = "neutral";

      if (roll > 0.8) {
        modifier = 300; // 3x Luck
        message = "🐉 THE GOLDEN DRAGON BLESSES YOUR NEXT SPIN!";
        type = "good";
      } else if (roll < 0.2) {
        modifier = 50; // Half luck
        message = "🌑 Shadows cloud your vision. Be careful.";
        type = "bad";
      }

      await (storage as any).updateGameState(userId, "default", { activeModifier: modifier });
      
      res.json({ message, type });
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
    const topUsers = await (storage as any).getTopUsers(10);
    res.json(topUsers);
  });

  return httpServer;
}