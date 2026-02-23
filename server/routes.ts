import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth/index";
import { registerAudioRoutes } from "./replit_integrations/audio";
import { registerImageRoutes } from "./replit_integrations/image";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup auth FIRST
  await setupAuth(app);
  registerAuthRoutes(app);
  
  // Register audio and image routes
  registerAudioRoutes(app);
  registerImageRoutes(app);

  app.post(api.auth.register.path, async (req, res) => {
    try {
      const input = api.auth.register.input.parse(req.body);
      const existing = await storage.getUserByUsername(input.username);
      if (existing) {
        return res.status(400).json({ message: "Username exists" });
      }
      const user = await storage.createUser({ ...input, email: `${input.username}@example.com` });
      (req.session as any).userId = user.id;
      res.status(201).json(user);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      } else {
        res.status(400).json({ message: "Invalid input" });
      }
    }
  });

  app.post(api.auth.login.path, async (req, res) => {
    try {
      const input = api.auth.login.input.parse(req.body);
      const user = await storage.getUserByUsername(input.username);
      if (!user || user.password !== input.password) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      (req.session as any).userId = user.id;
      res.status(200).json(user);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.get(api.game.state.path, async (req: any, res) => {
    try {
      let userId = (req.session as any).userId;
      
      // Fallback to Replit Auth if no session userId
      if (!userId && req.user && req.user.claims) {
        userId = req.user.claims.sub;
      }

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      let user = await storage.getUser(userId);
      if (!user) {
        // Try getting by username if userId was nickname
        user = await storage.getUserByUsername(userId);
      }

      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      res.json({ balance: user.balance, gameStates: [] });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch state" });
    }
  });

  app.post(api.game.spin.path, async (req: any, res) => {
    try {
      let userId = (req.session as any).userId;
      if (!userId && req.user && req.user.claims) {
        userId = req.user.claims.sub;
      }

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const input = api.game.spin.input.parse(req.body);
      let user = await storage.getUser(userId);
      if (!user) {
        user = await storage.getUserByUsername(userId);
      }

      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      let gameState = await storage.getGameState(user.id, input.slotId);
      if (!gameState) {
        gameState = await storage.updateGameState(user.id, input.slotId, { freeSpins: 0 });
      }

      const isFreeSpin = (gameState?.freeSpins ?? 0) > 0;
      
      if (!isFreeSpin && user.balance < input.betAmount) {
        return res.status(400).json({ message: "Insufficient balance" });
      }

      const symbols = ["🐉", "🐯", "🐢", "🌺", "🪙", "🏮"];
      const result = [
        symbols[Math.floor(Math.random() * symbols.length)],
        symbols[Math.floor(Math.random() * symbols.length)],
        symbols[Math.floor(Math.random() * symbols.length)],
      ];

      let winAmount = 0;
      let isJackpot = false;
      let freeSpinsAwarded = 0;

      // RTP Tuning: 3-match pays 15x, 2-match pays 1.2x
      if (result[0] === result[1] && result[1] === result[2]) {
        winAmount = input.betAmount * 15;
        isJackpot = true;
        freeSpinsAwarded = 10;
      } else if (result[0] === result[1] || result[1] === result[2] || result[0] === result[2]) {
        winAmount = Math.floor(input.betAmount * 1.2);
        // 10% chance of 3 free spins on 2-match
        if (Math.random() < 0.1) freeSpinsAwarded = 3;
      }

      const newBalance = isFreeSpin ? user.balance + winAmount : user.balance - input.betAmount + winAmount;
      const newFreeSpins = (gameState?.freeSpins ?? 0) - (isFreeSpin ? 1 : 0) + freeSpinsAwarded;

      await storage.updateBalance(user.id, newBalance);
      await storage.updateGameState(user.id, input.slotId, { freeSpins: newFreeSpins });

      res.json({
        result,
        winAmount,
        newBalance,
        freeSpinsAwarded,
        totalFreeSpins: newFreeSpins,
        isJackpot
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid spin request" });
      } else {
        res.status(500).json({ message: "Spin failed" });
      }
    }
  });

  app.get(api.game.leaderboard.path, async (req, res) => {
    const users = await storage.getLeaderboard();
    res.json(users.map(u => ({ username: u.username, balance: u.balance })));
  });

  app.get(api.ai.predict.path, async (req, res) => {
    res.json({ advice: "The stars align! The next 5 spins have a higher chance of hitting the Dragon symbol." });
  });

  return httpServer;
}
