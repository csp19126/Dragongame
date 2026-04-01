import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { SLOT_SYMBOLS, PAYLINES } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // --- HELPER: THE WEIGHTED ENGINE ---
  function getWeightedSymbol() {
    const totalWeight = SLOT_SYMBOLS.reduce((sum, s) => sum + s.weight, 0);
    let random = Math.random() * totalWeight;
    for (const symbol of SLOT_SYMBOLS) {
      if (random < symbol.weight) return symbol;
      random -= symbol.weight;
    }
    return SLOT_SYMBOLS[SLOT_SYMBOLS.length - 1]; 
  }

  // Optional AI integration routes
  if (process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY) {
    const [{ registerAudioRoutes }, { registerImageRoutes }, { registerChatRoutes }] = await Promise.all([
      import("./replit_integrations/audio"),
      import("./replit_integrations/image"),
      import("./replit_integrations/chat"),
    ]);
    registerAudioRoutes(app);
    registerImageRoutes(app);
    registerChatRoutes(app);
  }

  // --- ORACLE ENDPOINT ---
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

  // --- MAIN SPIN ROUTE ---
  app.post(api.game.spin.path, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const input = api.game.spin.input.parse(req.body);
      let user = await storage.getUser(userId) || await storage.getUserByUsername(userId);
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      let gameState = await storage.getGameState(user.id, input.slotId);
      if (!gameState) {
        gameState = await storage.updateGameState(user.id, input.slotId, { freeSpins: 0, activeModifier: 100 });
      }

      const isFreeSpin = (gameState?.freeSpins ?? 0) > 0;
      if (!isFreeSpin) {
        const deducted = await storage.deductBalanceAtomic(user.id, input.betAmount);
        if (!deducted) return res.status(400).json({ message: "Insufficient balance" });
        user = deducted;
      }

      const modifier = (gameState?.activeModifier ?? 100) / 100;

      const grid: string[][] = [
        [getWeightedSymbol().id, getWeightedSymbol().id, getWeightedSymbol().id],
        [getWeightedSymbol().id, getWeightedSymbol().id, getWeightedSymbol().id],
        [getWeightedSymbol().id, getWeightedSymbol().id, getWeightedSymbol().id],
      ];

      let winAmount = 0;
      const winLines: number[] = [];

      PAYLINES.forEach((line, idx) => {
        const vals = line.map(([col, row]) => (grid[col] && grid[col][row]) ? grid[col][row] : null);

        if (vals[0] && vals[0] === vals[1] && vals[1] === vals[2]) {
          const symbol = SLOT_SYMBOLS.find(s => s.id === vals[0]);
          if (symbol) {
            const baseWin = symbol.value * (input.betAmount / 1000);
            winAmount += Math.floor(baseWin * modifier);
            winLines.push(idx);
          }
        }
      });

      const newFreeSpins = (gameState?.freeSpins ?? 0) - (isFreeSpin ? 1 : 0);
      const newConsecutiveWins = winAmount > 0 ? (gameState?.consecutiveWins ?? 0) + 1 : 0;
      
      await storage.updateGameState(user.id, input.slotId, { 
        lastReels: grid.flat().join(","),
        activeModifier: 100,
        freeSpins: newFreeSpins,
        consecutiveWins: newConsecutiveWins
      });

      if (winAmount > 0) {
        user = await storage.creditBalanceAtomic(user.id, winAmount);
      }

      const updatedUser = await storage.updateStreak(
        user.id, 
        newConsecutiveWins, 
        user.maxStreak ?? 0, 
        (user.totalWins ?? 0) + (winAmount > 0 ? 1 : 0), 
        Math.max(user.maxWin ?? 0, winAmount)
      );

      res.json({
        grid,
        winLines,
        winAmount,
        newBalance: updatedUser.balance,
        oracleApplied: modifier !== 1.0,
        streak: newConsecutiveWins,
        gamesPlayed: updatedUser.gamesPlayed
      });
    } catch (err) {
      console.error("Spin error:", err);
      res.status(500).json({ message: "Spin failed" });
    }
  });

  // --- ADMIN & AUTH ---
  const ADMIN_USER_ID = "55109529";
  const isAdmin = (req: any, res: any, next: any) => {
    const uId = (req.session as any)?.userId;
    if (!uId || uId !== ADMIN_USER_ID) return res.status(403).json({ message: "Admin access only" });
    next();
  };

  app.post("/api/admin/gift-balance", async (req, res) => {
    const { userId, amount, adminKey } = req.body;
    if (adminKey !== (process.env.ADMIN_KEY || "dragon888admin")) return res.status(403).json({ message: "Forbidden" });
    const user = await storage.getUser(userId) || await storage.getUserByUsername(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    await storage.updateBalance(user.id, (user.balance ?? 0) + amount);
    res.json({ success: true });
  });

  app.post(api.auth.register.path, async (req, res) => {
    const input = api.auth.register.input.parse(req.body);
    const hashedPassword = await bcrypt.hash(input.password, 10);
    const user = await storage.createUser({ ...input, password: hashedPassword, email: `${input.username}@example.com` });
    (req.session as any).userId = user.id;
    const { password: _, ...safeUser } = user;
    res.status(201).json(safeUser);
  });

  app.post(api.auth.login.path, async (req, res) => {
    const input = api.auth.login.input.parse(req.body);
    const user = await storage.getUserByUsername(input.username);
    if (!user || !(await bcrypt.compare(input.password, user.password))) return res.status(401).json({ message: "Invalid credentials" });
    (req.session as any).userId = user.id;
    const { password: _, ...safeUser } = user;
    res.status(200).json(safeUser);
  });

  app.post("/api/logout", (req: any, res) => {
    req.session?.destroy(() => {
      res.clearCookie("connect.sid");
      res.status(200).json({ message: "Logged out" });
    });
  });

  app.get(api.game.state.path, async (req: any, res) => {
    const userId = (req.session as any).userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const user = await storage.getUser(userId) || await storage.getUserByUsername(userId);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    res.json({ balance: user.balance, streak: user.streak, totalWins: user.totalWins });
  });

  app.get(api.game.leaderboard.path, async (req, res) => {
    const leaderboardUsers = await storage.getLeaderboard();
    res.json(leaderboardUsers.map((u, idx) => ({ rank: idx + 1, username: u.username, balance: u.balance })));
  });

  app.post("/api/deposits/gift-card", async (req: any, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const { code } = req.body;
    const result = await storage.redeemGiftCardAtomic(code.toUpperCase(), userId);
    if (!result) return res.status(400).json({ message: "Invalid code" });
    res.json(result);
  });

  return httpServer;
}