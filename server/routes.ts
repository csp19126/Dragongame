import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";
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
      const user = await storage.createUser(input);
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
      res.status(200).json(user);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.get(api.game.state.path, async (req, res) => {
    let user = await storage.getUserByUsername("player1");
    if (!user) {
      user = await storage.createUser({ username: "player1", password: "pwd" });
    }
    res.json({ balance: user.balance, gameStates: [] });
  });

  app.post(api.game.spin.path, async (req, res) => {
    try {
      const input = api.game.spin.input.parse(req.body);
      let user = await storage.getUserByUsername("player1");
      if (!user) {
        user = await storage.createUser({ username: "player1", password: "pwd" });
      }
      
      if (user.balance < input.betAmount) {
        return res.status(400).json({ message: "Insufficient balance" });
      }

      const symbols = ["🐉", "🐯", "🐢", "🌺", "🪙"];
      const result = [
        symbols[Math.floor(Math.random() * symbols.length)],
        symbols[Math.floor(Math.random() * symbols.length)],
        symbols[Math.floor(Math.random() * symbols.length)],
      ];

      let winAmount = 0;
      let isJackpot = false;

      if (result[0] === result[1] && result[1] === result[2]) {
        winAmount = input.betAmount * 10;
        isJackpot = true;
      } else if (result[0] === result[1] || result[1] === result[2] || result[0] === result[2]) {
        winAmount = input.betAmount * 2;
      }

      const newBalance = user.balance - input.betAmount + winAmount;
      await storage.updateBalance(user.id, newBalance);

      res.json({
        result,
        winAmount,
        newBalance,
        freeSpinsAwarded: 0,
        totalFreeSpins: 0,
        isJackpot
      });
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
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
